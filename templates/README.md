# Built-in Templates

This folder holds the templates that ship with MarkupEditor. They appear in File > New from Template… and in the Templates tab of the side panel.

For most users, templates will be specific to their workflow. They are easy to create, save, edit, and delete from the MarkupEditor side panel. The built-in templates will be useful for some users, but they also serve as examples.

To contribute to the built-in templates, follow the [process below](#adding-a-built-in-template) and submit a [PR](https://github.com/stevengharris/MarkupEditorApp/pulls).

## How they are installed

At launch the app copies each built-in template into the user's templates folder, `Application Support/templates/`, as a folder of its own. From then on a built-in is an ordinary template: the user can rename, edit or delete it.

A built-in is copied once. The app records the folder names it has copied in UserDefaults (`seededTemplates`), so a template the user deletes is not restored, and one the user edits is not overwritten.

## Why a template is a folder

A user-created template can be more than a Markdown file. It can come with the images the document refers to, kept in the template's folder or in one image subfolder. A folder keeps those files together, and the same folder is what a user adds from disk, what Save as Template writes, and what New from Template copies from.

Each folder also holds a `manifest.json` with the template's `name`, `description` and optionally `document`, the name of its Markdown file. Without `document`, the app uses the folder's one Markdown file. The chooser and the Templates panel list templates from their manifests, so the folder name is never shown to the user.

The files in this built-in `templates` directory are flat because Xcode flattens bundled resources into one folder, so the app bundle cannot hold a folder per template. Instead `templates.json` supplies the folder name and manifest values, and the app builds the folder when it copies the template. For the same reason a built-in template cannot carry images; use remote image URLs.

## Layout

```
templates/
  README.md              this file; not bundled
  templates.json         index of the built-ins; bundled
  readme-github.md       a template's document; bundled
  skill-claude.md        a template's document; bundled
```

Each template is one Markdown file named for its template, in the form `<kind>-<variant>.md`. The name without `.md` is the template's `folder` in the index and the name of its folder in the user's templates folder, so it must be lowercase and hyphenated. A template says in a note at the top how to save the finished file, such as "Edit this template and save it as README.md in the project root directory."

## Index entries

`templates.json` is an array with one entry per built-in:

```json
{
  "folder": "readme-github",
  "name": "GitHub README",
  "description": "A project README with a badge block and suggested sections.",
  "file": "readme-github.md"
}
```

* `folder` is the name of the folder created for the template in the user's templates folder. By convention it is also the Markdown file's name here, without `.md`.
* `name` and `description` are shown in the chooser and the Templates panel.
* `file` is the name of the template's Markdown file, typically `<folder>.md`.

## Adding a built-in template

1. Create `templates/<folder>.md`. The app copies it as it is and fills in nothing, so text for the user to replace is ordinary text in the document.
2. Add an entry for it to `templates.json`.
3. In Xcode, select the new file and tick the MarkupEditorApp target in the File inspector, so it is copied into the app bundle.
4. Build and run. A user who already has an earlier version gets the new template at launch, because its folder name has not been copied before.

## Constraints

* **Bundled file names must be unique.** Because bundled resources are flattened, a template file cannot share a name with any other bundled resource. Naming each file for its template keeps them distinct, and the `name` lets you provide a user-visible name independent of the file name.
* **A changed built-in does not reach existing users.** The app does not overwrite a template it has already copied. To give users a new version, add it under a new `folder`. Users who already have the old one keep it alongside the new one.
