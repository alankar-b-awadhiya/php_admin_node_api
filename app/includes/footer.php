    </main>
  </div>
</div>

<div class="toast-stack" id="toastStack"></div>

<div class="modal-backdrop" id="modalBackdrop"></div>

<script src="assets/js/common.js?v=<?= ASSET_VERSION ?>"></script>
<?php if (!empty($pageScript)): ?>
<script src="assets/js/<?= htmlspecialchars($pageScript) ?>?v=<?= ASSET_VERSION ?>"></script>
<?php endif; ?>
</body>
</html>
