//! Source files, byte spans, and positions — the floor of the Vibe compiler.
//!
//! See `docs/language/05-rust-implementation.md`.
#![forbid(unsafe_code)]

/// A half-open byte range `[lo, hi)` into a source file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Span {
    pub lo: u32,
    pub hi: u32,
}

impl Span {
    pub const fn new(lo: u32, hi: u32) -> Self {
        Self { lo, hi }
    }

    /// An empty span at a single offset.
    pub const fn at(offset: u32) -> Self {
        Self {
            lo: offset,
            hi: offset,
        }
    }

    pub const fn len(&self) -> u32 {
        self.hi - self.lo
    }

    pub const fn is_empty(&self) -> bool {
        self.lo == self.hi
    }

    /// The smallest span covering both `self` and `other`.
    pub fn to(self, other: Span) -> Span {
        Span {
            lo: self.lo.min(other.lo),
            hi: self.hi.max(other.hi),
        }
    }
}

/// A value paired with the source span it came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Spanned<T> {
    pub node: T,
    pub span: Span,
}

impl<T> Spanned<T> {
    pub const fn new(node: T, span: Span) -> Self {
        Self { node, span }
    }
}

/// Identifies a source file within a compilation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SourceId(pub u32);

/// A 1-based line/column position, for diagnostics and source maps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Location {
    pub line: u32,
    pub col: u32,
}

/// A source file plus a precomputed line index for offset→line/col mapping.
#[derive(Debug, Clone)]
pub struct SourceFile {
    pub id: SourceId,
    pub name: String,
    pub text: String,
    /// Byte offset of the start of each line (`line_starts[0] == 0`).
    line_starts: Vec<u32>,
}

impl SourceFile {
    pub fn new(id: SourceId, name: impl Into<String>, text: impl Into<String>) -> Self {
        let text = text.into();
        let mut line_starts = vec![0u32];
        for (i, b) in text.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push((i + 1) as u32);
            }
        }
        Self {
            id,
            name: name.into(),
            text,
            line_starts,
        }
    }

    /// The source text covered by `span`.
    pub fn slice(&self, span: Span) -> &str {
        &self.text[span.lo as usize..span.hi as usize]
    }

    /// Map a 0-based line/column (as an LSP editor sends) to a byte offset.
    pub fn offset_at(&self, line0: u32, col0: u32) -> u32 {
        let line_start = self
            .line_starts
            .get(line0 as usize)
            .copied()
            .unwrap_or(self.text.len() as u32);
        let line = &self.text[line_start as usize..];
        let byte = line
            .char_indices()
            .nth(col0 as usize)
            .map(|(i, _)| i)
            .unwrap_or(line.len());
        line_start + byte as u32
    }

    /// Map a byte offset to a 1-based line/column.
    pub fn location(&self, offset: u32) -> Location {
        let line_idx = match self.line_starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let line_start = self.line_starts[line_idx];
        // Column counts characters, not bytes, so multi-byte UTF-8 reads naturally.
        let col = self.text[line_start as usize..offset as usize]
            .chars()
            .count() as u32;
        Location {
            line: line_idx as u32 + 1,
            col: col + 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn span_len_and_empty() {
        assert_eq!(Span::new(3, 8).len(), 5);
        assert!(Span::at(4).is_empty());
    }

    #[test]
    fn span_union() {
        assert_eq!(Span::new(2, 5).to(Span::new(8, 10)), Span::new(2, 10));
    }

    #[test]
    fn location_maps_line_and_col() {
        let f = SourceFile::new(SourceId(0), "a.vibe", "ab\ncde\nf");
        assert_eq!(f.location(0), Location { line: 1, col: 1 });
        assert_eq!(f.location(1), Location { line: 1, col: 2 });
        assert_eq!(f.location(3), Location { line: 2, col: 1 }); // 'c'
        assert_eq!(f.location(7), Location { line: 3, col: 1 }); // 'f'
    }

    #[test]
    fn slice_returns_span_text() {
        let f = SourceFile::new(SourceId(0), "a.vibe", "agent Support");
        assert_eq!(f.slice(Span::new(6, 13)), "Support");
    }
}
