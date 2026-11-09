to push to the pages site use:
```
git push deploy master --force 
```

## writing a post
1. copy `~/obs-notes/post/_post-template.md` to `<name>.html.md` in the same folder and write.
2. in obsidian: ctrl+p → **Export to HTML: Download as an HTML file**.
   - posts → `posts/`
   - `posts.html.md` (the index — add a link to the new post) → `pages/`
3. commit, then deploy (above).

styling for every exported page lives in `styles/post.css` (no re-export needed).
the export plugin lives in `obsidian-plugin/export-to-html-custom/` and is symlinked into
`~/obs-notes/.obsidian/plugins/` — reload the plugin in obsidian after editing it.
