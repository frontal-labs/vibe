//! Re-anchor TypeScript compiler diagnostics back to `.vibe` source.
//!
//! The Rust front end does not type-check TypeScript — it emits `.ts` and the
//! project's `tsc` checks it (the two-pass design, see
//! `docs/language/05-rust-implementation.md`). This module parses `tsc` output and
//! maps each `TSxxxx` error's generated line to a `.vibe` offset via the emitter's
//! [`line_map`](vibe_emit::Emit::line_map). Running `tsc` itself is the caller's job
//! (the CLI / LSP) — this module is pure so it can be unit-tested offline.

use vibe_diagnostics::{Diagnostic, VbCode};
use vibe_span::Span;

/// A diagnostic as reported by `tsc` (generated coordinates, 1-based).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TsError {
    pub gen_line: u32,
    pub gen_col: u32,
    pub is_error: bool,
    pub code: String,
    pub message: String,
}

/// Parse `tsc --pretty false` output. Lines look like:
/// `path/to/main.vibe.ts(12,7): error TS2322: Type 'number' is not assignable…`
pub fn parse_tsc_output(output: &str) -> Vec<TsError> {
    output.lines().filter_map(parse_line).collect()
}

fn parse_line(line: &str) -> Option<TsError> {
    let paren = line.find('(')?;
    let close_rel = line[paren..].find(')')?;
    let close = paren + close_rel;
    let (l, c) = line[paren + 1..close].split_once(',')?;
    let gen_line: u32 = l.trim().parse().ok()?;
    let gen_col: u32 = c.trim().parse().ok()?;

    // After ")": "`: error TS2322: message`"
    let rest = line[close + 1..].trim_start_matches(':').trim_start();
    let (is_error, after_sev) = if let Some(r) = rest.strip_prefix("error") {
        (true, r)
    } else if let Some(r) = rest.strip_prefix("warning") {
        (false, r)
    } else {
        return None;
    };
    let (code, message) = after_sev.trim_start().split_once(':')?;
    Some(TsError {
        gen_line,
        gen_col,
        is_error,
        code: code.trim().to_string(),
        message: message.trim().to_string(),
    })
}

/// Convert `tsc` errors into Vibe diagnostics anchored at `.vibe` offsets, using a
/// generated-line → source-offset `line_map` (sorted by generated line).
pub fn reanchor(errors: &[TsError], line_map: &[(u32, u32)]) -> Vec<Diagnostic> {
    errors
        .iter()
        .filter_map(|e| {
            // tsc lines are 1-based; the line map is 0-based.
            let off = src_offset_for(line_map, e.gen_line.saturating_sub(1))?;
            let span = Span::at(off);
            let d = if e.is_error {
                Diagnostic::error(VbCode(0), span, e.message.clone())
            } else {
                Diagnostic::warning(VbCode(0), span, e.message.clone())
            };
            Some(d.with_external_code(e.code.clone()))
        })
        .collect()
}

/// The source offset for a 0-based generated line: the mark on that line, or the
/// nearest preceding one.
fn src_offset_for(line_map: &[(u32, u32)], gen_line: u32) -> Option<u32> {
    let mut best = None;
    for &(gl, off) in line_map {
        if gl <= gen_line {
            best = Some(off);
        } else {
            break;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_error_and_warning_lines() {
        let out =
            "main.vibe.ts(12,7): error TS2322: Type 'number' is not assignable to type 'string'.\n\
                   main.vibe.ts(3,1): warning TS6133: 'x' is declared but never used.\n\
                   Found 2 errors.";
        let errs = parse_tsc_output(out);
        assert_eq!(errs.len(), 2);
        assert_eq!(errs[0].code, "TS2322");
        assert_eq!(errs[0].gen_line, 12);
        assert!(errs[0].is_error);
        assert_eq!(errs[1].code, "TS6133");
        assert!(!errs[1].is_error);
    }

    #[test]
    fn reanchors_to_nearest_preceding_source_offset() {
        // Generated line 10 → source offset 42; line 11 → 60.
        let line_map = [(10u32, 42u32), (11u32, 60u32)];
        let errs = vec![TsError {
            gen_line: 12, // 1-based → generated line 11
            gen_col: 5,
            is_error: true,
            code: "TS2322".to_string(),
            message: "bad".to_string(),
        }];
        let diags = reanchor(&errs, &line_map);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].span, Span::at(60));
        assert_eq!(diags[0].display_code(), "TS2322");
    }
}
