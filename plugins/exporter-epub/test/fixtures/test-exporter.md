---
creator: Steven G. Harris
title: MarkupEditor Fidelity Testing
description: A baseline test document exercising every element the MarkupEditor supports.
subject: [MarkupEditor, testing, fidelity]
language: en-US
date: 2026-09-17
---

# Test Document

This document is provided as a baseline for testing export plugins. It contains all of the elements supported by the MarkupEditor. An exporter might or might not preserve fidelity of each element in terms of exact styling. Tests should verify that elements end up in their expected state upon export. This document itself is not particularly "readable" from a human perspective, since it is just organizing the supported elements linearly.

# H1 Style

## H2 Style

### H3 Style

#### H4 Style

##### H5 Style

###### H6 Style

```html
Code Style
```

**Bold text**

*Italic text*

`Code text`

~~Strikethrough text~~

A [link](https://foo.com) to an external site

A [link](#test-document) to an internal header using the Markdown convention

A local image...

<img src="markupeditor.svg" width="144" height="144">

A remote image...

<img src="https://github.com/user-attachments/assets/c67b6aa0-2576-4a0b-81d0-229ee501b59d" alt="MarkupEditor logo" width="128" height="128">

Tables in the MarkupEditor, like in Github Formatted Markdown, do not support embedded block elements. So, you cannot adjust the size of text by assigning a paragraph style of H1, and you cannot embed lists or indents. You can use inline images. The table below shows what is supported all in one place, including justification/alignment.

|  | A table with a header |  |
| --- | :---: | --- |
| Left justified | centered | and right justified |
| Plain text | and | **formatted** *text.* |
| And an inline image | <img src="markupeditor.svg" width="144" height="144"> | should all show up properly. |

* A bulleted list

  * with a sublist

    1. and a numbered

    2. sublist within it.

1. A numbered list

   1. with a sublist

      * and a bulleted

      * sublist within it.

> An indented (aka quoted) paragraph.
>
> > A doubly-indented paragraph.

An indented image...

> <img src="markupeditor.svg" width="144" height="144">

A horizontal rule at the bottom.

---