//! Lower a captured TypeScript type (as text) to a Zod schema expression.
//!
//! Handles the common shapes: primitives, `T[]` / `Array<T>`, object literals with
//! optional fields, and string-literal unions → `z.enum`. Anything else falls back
//! to `z.unknown()` (the checker separately rejects types that can't be a tool
//! schema — see `vibe_checker`). Fuller coverage lands with the `tsc` integration.

/// Lower a type-annotation string to a Zod schema expression.
pub fn lower_type(raw: &str) -> String {
    let t = raw.trim();
    match t {
        "string" => "z.string()".to_string(),
        "number" => "z.number()".to_string(),
        "boolean" => "z.boolean()".to_string(),
        "any" | "unknown" | "" => "z.unknown()".to_string(),
        _ => {
            if let Some(inner) = t.strip_suffix("[]") {
                return format!("z.array({})", lower_type(inner));
            }
            if let Some(inner) = t.strip_prefix("Array<").and_then(|s| s.strip_suffix('>')) {
                return format!("z.array({})", lower_type(inner));
            }
            if t.starts_with('{') && t.ends_with('}') {
                return lower_object(&t[1..t.len() - 1]);
            }
            if find_top_level(t, '|').is_some() {
                let parts: Vec<&str> = split_top_level(t, '|').into_iter().map(str::trim).collect();
                if !parts.is_empty() && parts.iter().all(|p| is_string_literal(p)) {
                    return format!("z.enum([{}])", parts.join(", "));
                }
            }
            "z.unknown()".to_string()
        }
    }
}

fn lower_object(inner: &str) -> String {
    let mut parts = Vec::new();
    for field in split_top_level(inner, ';')
        .into_iter()
        .flat_map(|f| split_top_level(f, ','))
    {
        let f = field.trim();
        if f.is_empty() {
            continue;
        }
        if let Some(ci) = find_top_level(f, ':') {
            let key_raw = f[..ci].trim();
            let ty = f[ci + 1..].trim();
            let optional = key_raw.ends_with('?');
            let key = key_raw.trim_end_matches('?').trim();
            let mut z = lower_type(ty);
            if optional {
                z = format!("{z}.optional()");
            }
            parts.push(format!("{key}: {z}"));
        }
    }
    format!("z.object({{ {} }})", parts.join(", "))
}

fn is_string_literal(p: &str) -> bool {
    p.len() >= 2 && p.starts_with('"') && p.ends_with('"')
}

/// Convert a `.vibe` string literal (single or triple-quoted) to a TypeScript
/// template literal, preserving `${}` interpolation and newlines.
pub fn string_to_template(raw: &str) -> String {
    let inner = if raw.len() >= 6 && raw.starts_with("\"\"\"") && raw.ends_with("\"\"\"") {
        &raw[3..raw.len() - 3]
    } else if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        &raw[1..raw.len() - 1]
    } else {
        raw
    };
    format!("`{}`", inner.replace('`', "\\`"))
}

/// Split `s` on top-level `delim`, respecting `<>`/`()`/`[]`/`{}` nesting and
/// string literals.
fn split_top_level(s: &str, delim: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut in_str: Option<char> = None;
    let mut last = 0;
    for (i, c) in s.char_indices() {
        if let Some(q) = in_str {
            if c == q {
                in_str = None;
            }
            continue;
        }
        match c {
            '"' | '\'' | '`' => in_str = Some(c),
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            c if c == delim && depth == 0 => {
                parts.push(&s[last..i]);
                last = i + c.len_utf8();
            }
            _ => {}
        }
    }
    parts.push(&s[last..]);
    parts
}

fn find_top_level(s: &str, ch: char) -> Option<usize> {
    let mut depth = 0i32;
    let mut in_str: Option<char> = None;
    for (i, c) in s.char_indices() {
        if let Some(q) = in_str {
            if c == q {
                in_str = None;
            }
            continue;
        }
        match c {
            '"' | '\'' | '`' => in_str = Some(c),
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            c if c == ch && depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primitives() {
        assert_eq!(lower_type("string"), "z.string()");
        assert_eq!(lower_type(" number "), "z.number()");
        assert_eq!(lower_type("boolean"), "z.boolean()");
    }

    #[test]
    fn arrays() {
        assert_eq!(lower_type("string[]"), "z.array(z.string())");
        assert_eq!(lower_type("Array<number>"), "z.array(z.number())");
    }

    #[test]
    fn object_with_optional() {
        assert_eq!(
            lower_type("{ a: string; b?: number }"),
            "z.object({ a: z.string(), b: z.number().optional() })"
        );
    }

    #[test]
    fn nested_object_in_array() {
        assert_eq!(
            lower_type("Array<{ a: number }>"),
            "z.array(z.object({ a: z.number() }))"
        );
    }

    #[test]
    fn string_literal_union_is_enum() {
        assert_eq!(
            lower_type(r#""a" | "b" | "c""#),
            r#"z.enum(["a", "b", "c"])"#
        );
    }

    #[test]
    fn unknown_named_type_falls_back() {
        assert_eq!(lower_type("OrderStatus"), "z.unknown()");
        assert_eq!(lower_type("(x: number) => void"), "z.unknown()");
    }

    #[test]
    fn template_conversion_preserves_interpolation() {
        assert_eq!(string_to_template("\"Hi ${name}\""), "`Hi ${name}`");
        assert_eq!(
            string_to_template("\"\"\"multi\nline\"\"\""),
            "`multi\nline`"
        );
    }
}
