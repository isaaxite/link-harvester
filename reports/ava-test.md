## AVA Test Results

| Asserts | Passes | Failures |
|---------|--------|----------|
| 37 | 11 | 26 |

**Pass Rate:** 29.73%

*Generated at: 29/3/2026, 3:43:41 am*

### ❌ Failed Tests (26)

<details>
<summary><b>extracts markdown image with alt text</b> (3)</summary>

</details>

<details>
<summary><b>extracts markdown image with relative path</b> (5)</summary>

</details>

<details>
<summary><b>does not set text field on markdown images</b> (6)</summary>

</details>

<details>
<summary><b>extracts markdown link with text</b> (7)</summary>

</details>

<details>
<summary><b>extracts markdown link with root-relative url</b> (8)</summary>

</details>

<details>
<summary><b>extracts markdown link with relative file path</b> (9)</summary>

</details>

<details>
<summary><b>does not set alt field on markdown links</b> (10)</summary>

</details>

<details>
<summary><b>markdown image syntax is not duplicated as a markdown link</b> (11)</summary>

</details>

<details>
<summary><b>extracts HTML img with single-quoted src</b> (12)</summary>

</details>

<details>
<summary><b>extracts HTML img with double-quoted src</b> (13)</summary>

</details>

<details>
<summary><b>extracts HTML img with uppercase tag (case-insensitive)</b> (14)</summary>

</details>

<details>
<summary><b>extracts HTML anchor with double-quoted href</b> (15)</summary>

</details>

<details>
<summary><b>extracts HTML anchor with single-quoted href</b> (16)</summary>

</details>

<details>
<summary><b>extracts HTML anchor with uppercase tag (case-insensitive)</b> (17)</summary>

</details>

<details>
<summary><b>extracts all four link types from a mixed file</b> (18)</summary>

</details>

<details>
<summary><b>preserves insertion order (MarkdownImage before MarkdownLink on same pass)</b> (19)</summary>

</details>

<details>
<summary><b>extracts multiple markdown images on same line</b> (20)</summary>

</details>

<details>
<summary><b>extracts multiple markdown links on same line</b> (21)</summary>

</details>

<details>
<summary><b>extracts multiple HTML img tags on same line</b> (22)</summary>

</details>

<details>
<summary><b>extracts multiple HTML anchors on same line</b> (23)</summary>

</details>

*... and 6 more failures not shown*

<details>
<summary><b>📋 All Test Details</b> (37 items)</summary>

| # | Status | Test Name |
|---|--------|-----------|
| 1 | ✅ | returns empty array for an empty file |
| 2 | ✅ | returns empty array when file has no links |
| 3 | ❌ | extracts markdown image with alt text |
| 4 | ✅ | extracts markdown image with empty alt text |
| 5 | ❌ | extracts markdown image with relative path |
| 6 | ❌ | does not set text field on markdown images |
| 7 | ❌ | extracts markdown link with text |
| 8 | ❌ | extracts markdown link with root-relative url |
| 9 | ❌ | extracts markdown link with relative file path |
| 10 | ❌ | does not set alt field on markdown links |
| 11 | ❌ | markdown image syntax is not duplicated as a markdown link |
| 12 | ❌ | extracts HTML img with single-quoted src |
| 13 | ❌ | extracts HTML img with double-quoted src |
| 14 | ❌ | extracts HTML img with uppercase tag (case-insensitive) |
| 15 | ❌ | extracts HTML anchor with double-quoted href |
| 16 | ❌ | extracts HTML anchor with single-quoted href |
| 17 | ❌ | extracts HTML anchor with uppercase tag (case-insensitive) |
| 18 | ❌ | extracts all four link types from a mixed file |
| 19 | ❌ | preserves insertion order (MarkdownImage before MarkdownLink on same pass) |
| 20 | ❌ | extracts multiple markdown images on same line |
| 21 | ❌ | extracts multiple markdown links on same line |
| 22 | ❌ | extracts multiple HTML img tags on same line |
| 23 | ❌ | extracts multiple HTML anchors on same line |
| 24 | ✅ | line numbers are 1-based and accurate across multiple lines |
| 25 | ❌ | line numbers reflect actual line position in mixed file |
| 26 | ❌ | handles CRLF line endings correctly |
| 27 | ✅ | every result has type, syntax, url, and line fields |
| 28 | ✅ | syntax field matches the exact matched text in the source line |
| 29 | ✅ | rejects with an error when file does not exist |
| 30 | ✅ | extracts link with URL containing query string and hash |
| 31 | ✅ | does not extract reference-style links (not supported syntax) |
| 32 | ✅ | handles file with only whitespace lines (no links) |
| 33 | ❌ | extracts markdown image inline with surrounding text |
| 34 | ❌ | extracts HTML img with additional attributes |
| 35 | ❌ | large file with many lines returns links on correct line numbers |
| 36 | ❌ | extracts HTML anchor with additional attributes |
| 37 | ✅ | single-line file with no newline is handled |

</details>

---

### 💡 Suggestions

- Please review the failed tests above
- Check if your changes introduced breaking changes
- Ensure all tests pass before merging

