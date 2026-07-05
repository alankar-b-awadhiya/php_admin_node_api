<?php
require_once __DIR__ . '/../app/config/config.php';
$pageTitle = 'Media Library';
$activeNav = 'media';
$pageScript = 'media.js';
include __DIR__ . '/../app/includes/header.php';
?>
<div class="page-header">
  <div>
    <h2>Media Library</h2>
    <p class="subtitle">Browse categories and manage files</p>
  </div>
</div>

<div class="media-tabs" id="mediaTabs">
  <button class="media-tab" data-type="GALLERY" data-label="Gallery">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 13.5 7.5 9l3 3 2.5-2.5L17 13" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Gallery
  </button>
  <button class="media-tab" data-type="VIDEO" data-label="Videos">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M14 8.2 18 6v7l-4-2.2" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Videos
  </button>
  <button class="media-tab" data-type="DOCUMENT" data-label="Documents">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2v4h4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Documents
  </button>
  <button class="media-tab" data-type="AUDIO" data-label="Audio">
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M8 4v9.2a2.6 2.6 0 1 0 1.3 2.25V8h4V4H8Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
    Audio
  </button>
</div>

<div class="card">
  <div class="media-toolbar-header">
    <div class="media-toolbar-lead" id="mediaBreadcrumb">
      <button class="btn btn-secondary btn-sm folder-crumb-back" id="btnBack" type="button" style="display:none;">&larr; Back</button>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4.4l1.6 2H17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z"/></svg>
      <h3 id="mediaCrumbTitle">Gallery</h3>
    </div>
    <div class="media-toolbar-right" id="folderToolbar">
      <button class="btn btn-success" id="btnNewCategory" type="button">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        New Category
      </button>
      <button class="btn-square" id="btnRefreshMedia" type="button" title="Refresh">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10a6 6 0 0 1 10.2-4.24M16 10a6 6 0 0 1-10.2 4.24M4 3v3.5H7.5M16 17v-3.5H12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="media-toolbar-right" id="filesToolbar" style="display:none;">
      <input type="search" id="mediaSearchInput" placeholder="Search...">
      <button class="btn btn-success" id="btnUpload" type="button">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        Upload
      </button>
    </div>
  </div>

  <div id="folderView">
    <div class="folder-list" id="folderList">
      <div class="table-empty">Loading…</div>
    </div>
  </div>

  <div id="filesView" style="display:none;">
    <div class="media-grid" id="mediaGrid">
      <div class="table-empty">Loading…</div>
    </div>
    <div class="pagination" id="mediaPagination"></div>
  </div>
</div>

<?php include __DIR__ . '/../app/includes/footer.php'; ?>
