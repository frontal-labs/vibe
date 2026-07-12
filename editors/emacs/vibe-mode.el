;;; vibe-mode.el --- Major mode for the Vibe language -*- lexical-binding: t; -*-

;; A lightweight major mode for `.vibe' files with font-lock and Eglot (LSP)
;; wiring to the `vibe-lsp' binary.  Build it with:
;;   cargo build -p vibe_lsp --release   (and put `vibe-lsp' on your PATH)

;;; Code:

(defvar vibe-mode-keywords
  '("agent" "tool" "model" "memory" "plugin" "config" "use" "import"
    "export" "on" "with")
  "Declaration and control keywords in the Vibe language.")

(defvar vibe-mode-font-lock-keywords
  (list
   (cons (regexp-opt vibe-mode-keywords 'words) 'font-lock-keyword-face)
   '("\\bclaude-[a-z0-9-]+\\b" . font-lock-constant-face)
   '("///.*$" . font-lock-doc-face)
   '("//.*$" . font-lock-comment-face))
  "Font-lock highlighting for `vibe-mode'.")

;;;###autoload
(define-derived-mode vibe-mode prog-mode "Vibe"
  "Major mode for editing Vibe (.vibe) source files."
  (setq-local comment-start "// ")
  (setq-local comment-end "")
  (setq-local font-lock-defaults '(vibe-mode-font-lock-keywords)))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.vibe\\'" . vibe-mode))

;; Eglot (built into Emacs 29+) provides LSP features via vibe-lsp.
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs '(vibe-mode . ("vibe-lsp"))))

(provide 'vibe-mode)
;;; vibe-mode.el ends here
