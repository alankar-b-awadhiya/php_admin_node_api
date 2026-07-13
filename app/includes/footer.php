    </main>
  </div>
</div>

<div class="toast-stack" id="toastStack"></div>

<div class="modal-backdrop" id="modalBackdrop"></div>

<!-- Theme panel (right drawer) -->
<aside class="theme-panel" id="themePanel" aria-hidden="true">
  <button class="theme-close" id="themeClose" aria-label="Close theme panel">&times;</button>
  <h4>Theme settings</h4>
  <div class="theme-controls">
    <div class="color-row">
      <div class="label">Primary</div>
      <input type="color" id="primaryColor" value="#4f5dff" />
    </div>
    <div class="color-row">
      <div class="label">Secondary</div>
      <input type="color" id="secondaryColor" value="#7c3aed" />
    </div>
    <div class="theme-preview">
      <div class="preview-label">Preview</div>
      <div class="preview-actions">
        <button class="btn btn-primary">Primary</button>
        <button class="btn btn-secondary">Secondary</button>
      </div>
    </div>
    <div class="theme-snippet" id="themeSnippet">:root { --primary: #4f5dff; --secondary: #7c3aed; }</div>
    <div class="theme-actions">
      <button class="btn btn-sm" id="copyThemeBtn">Copy CSS</button>
      <button class="btn btn-sm" id="resetThemeBtn">Reset</button>
    </div>
  </div>
</aside>

<script src="assets/js/common.js?v=<?= ASSET_VERSION ?>"></script>
<?php if (!empty($pageScript)): ?>
<script src="assets/js/<?= htmlspecialchars($pageScript) ?>?v=<?= ASSET_VERSION ?>"></script>
<?php endif; ?>
</body>
</html>
