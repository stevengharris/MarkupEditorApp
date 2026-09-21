---
creator: Steven G. Harris
title: MarkupEditor Fidelity Testing
description: A baseline test document exercising every element the MarkupEditor supports.
keywords: [MarkupEditor, testing, fidelity]
---

# Test Document

This document is provided as a baseline for testing export plugins. It contains all of the elements supported by the MarkupEditor. An exporter might or might not preserve fidelity of each element in terms of exact styling. Tests should verify that elements end up in their expected state upon export. This document itself it not particularly “readable” from a human perspective, since it is just organizing the supported elements linearly.

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

| A table with a header, |
| --- |
| containing |
| and |

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

Some mixtures of elements…

An indented image...

> <img src="markupeditor.svg" width="144" height="144">

| A table with various paragraph styles and items in it... |
| --- |
| A list |  | Some formatted text with a link |

A horizontal rule at the bottom.

---
