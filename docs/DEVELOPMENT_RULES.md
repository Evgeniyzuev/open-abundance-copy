# Development Rules

## UTF-8 And PowerShell

Most source files in this project are UTF-8 and contain Russian UI text.

Avoid rewriting source files with broad PowerShell commands such as:

```powershell
Set-Content path -Value $text
```

This can accidentally introduce a BOM or corrupt non-ASCII text into mojibake.

Preferred editing options:

- use `apply_patch` for manual edits;
- use the app/editor for text edits;
- if a mechanical rewrite is unavoidable, explicitly preserve UTF-8 without BOM and verify the diff immediately;
- after any bulk text rewrite, check that Russian strings are readable in `git diff`.

If mojibake appears in a diff, stop and fix it before continuing.
