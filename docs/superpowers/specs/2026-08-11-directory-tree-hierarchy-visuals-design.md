# Directory Tree Hierarchy Visuals Design

## Goal

Make it immediately clear which sidebar files and folders belong to an expanded parent folder, without changing navigation, upload targeting, preview behavior, permissions, or data loading.

## Approved Visual Treatment

- Increase each nested level's indentation from 12px to 20px.
- Wrap expanded children in a visually grouped branch beneath their parent.
- Add a faint vertical connector line aligned with the child branch.
- Give the expanded child region a very subtle tinted background that remains compatible with the existing light and dark theme tokens.
- Keep rows compact and preserve the current icons, labels, hover states, context menu, expansion state, and recursive rendering.
- Keep the parent row visually stronger than its children, while avoiding card borders or heavy separators.

## Component Scope

Only `app/components/App/DirectoryNode.vue` changes. The component continues to render recursively and continues using the existing loading, empty-folder, pagination, preview, upload-destination, and refresh behavior.

## Responsive and Deep-Nesting Behavior

The visual treatment remains inside the sidebar's existing horizontal scroll/clipping behavior. Child labels keep truncating instead of widening the sidebar. Every nested level receives the same 20px step and connector treatment, so deeper branches remain predictable.

## Accessibility

The design does not replace semantic controls or rely on color alone: spatial indentation and the connector line both communicate hierarchy. Existing keyboard and pointer behavior remains unchanged.

## Verification

- Confirm root rows remain flush with the existing sidebar alignment.
- Confirm expanded child files visibly group beneath the correct folder.
- Confirm nested folders repeat the same branch treatment.
- Confirm loading, empty, and load-more rows align with child content.
- Run the existing automated suite and production build validation.
- Inspect the rendered sidebar for clipping, overlap, and console errors when an authenticated browser session is available.
