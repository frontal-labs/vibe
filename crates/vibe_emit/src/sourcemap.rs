//! Minimal Source Map v3 emission (Base64 VLQ). Line-granular for R4 — enough to
//! re-anchor a generated line to its `.vibe` origin; dense per-token mappings land
//! with the `tsc` integration in R6.

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Append the Base64 VLQ encoding of a signed value to `out`.
pub fn vlq_encode(value: i64, out: &mut String) {
    let mut v = if value < 0 {
        ((-value) as u64) << 1 | 1
    } else {
        (value as u64) << 1
    };
    loop {
        let mut digit = (v & 0b1_1111) as usize;
        v >>= 5;
        if v > 0 {
            digit |= 0b10_0000;
        }
        out.push(B64[digit] as char);
        if v == 0 {
            break;
        }
    }
}

/// Escape a string for embedding in JSON.
pub fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// A generated line mapped to a 0-based source (line, col).
pub struct LineMapping {
    pub gen_line: u32,
    pub src_line: u32,
    pub src_col: u32,
}

/// Build the `mappings` field: one segment per mapped generated line, empty
/// otherwise, lines separated by `;`.
pub fn build_mappings(total_lines: u32, marks: &[LineMapping]) -> String {
    use std::collections::HashMap;
    let by_line: HashMap<u32, &LineMapping> = marks.iter().map(|m| (m.gen_line, m)).collect();
    let mut out = String::new();
    let (mut prev_idx, mut prev_line, mut prev_col) = (0i64, 0i64, 0i64);
    for line in 0..total_lines {
        if line > 0 {
            out.push(';');
        }
        if let Some(m) = by_line.get(&line) {
            vlq_encode(0, &mut out); // generated column 0
            vlq_encode(0 - prev_idx, &mut out);
            prev_idx = 0;
            vlq_encode(m.src_line as i64 - prev_line, &mut out);
            prev_line = m.src_line as i64;
            vlq_encode(m.src_col as i64 - prev_col, &mut out);
            prev_col = m.src_col as i64;
        }
    }
    out
}

/// Assemble a full v3 source map JSON document.
pub fn source_map_json(
    file: &str,
    source_name: &str,
    source_content: &str,
    mappings: &str,
) -> String {
    format!(
        "{{\"version\":3,\"file\":\"{}\",\"sources\":[\"{}\"],\"sourcesContent\":[\"{}\"],\"names\":[],\"mappings\":\"{}\"}}",
        json_escape(file),
        json_escape(source_name),
        json_escape(source_content),
        mappings
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vlq_known_vectors() {
        let enc = |n| {
            let mut s = String::new();
            vlq_encode(n, &mut s);
            s
        };
        assert_eq!(enc(0), "A");
        assert_eq!(enc(1), "C");
        assert_eq!(enc(-1), "D");
        assert_eq!(enc(16), "gB");
        assert_eq!(enc(123), "2H");
    }

    #[test]
    fn json_escape_handles_control_chars() {
        assert_eq!(json_escape("a\"b\\c\n"), "a\\\"b\\\\c\\n");
    }

    #[test]
    fn mappings_and_json_are_wellformed() {
        let marks = vec![
            LineMapping {
                gen_line: 0,
                src_line: 0,
                src_col: 0,
            },
            LineMapping {
                gen_line: 2,
                src_line: 5,
                src_col: 0,
            },
        ];
        let m = build_mappings(3, &marks);
        // line 0 mapped, line 1 empty, line 2 mapped.
        assert_eq!(m.split(';').count(), 3);
        let json = source_map_json("out.ts", "in.vibe", "agent A {}", &m);
        assert!(json.contains("\"version\":3"));
        assert!(json.contains("\"sources\":[\"in.vibe\"]"));
    }
}
