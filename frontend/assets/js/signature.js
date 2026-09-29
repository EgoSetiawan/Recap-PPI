import { btnSecondary, btnSm } from "./ui.js";

export class SignaturePad {
  /**
   * @param {HTMLElement} root
   * @param {{ required?: boolean }} [opts]
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.mode = "draw";
    this.uploadedFile = null;
    this.uploadedUrl = "";
    this._dirty = false;
    this._drawing = false;
    this.required = !!opts.required;
    this._render();
    this._bind();
  }

  _render() {
    this.root.innerHTML = `
      <div class="sig-tabs">
        <button type="button" class="${btnSecondary} ${btnSm} sig-tab active" data-mode="draw">Gambar</button>
        <button type="button" class="${btnSecondary} ${btnSm} sig-tab" data-mode="upload">Unggah</button>
      </div>
      <div class="sig-draw-panel">
        <div class="signature-pad-wrap">
          <canvas width="560" height="180" aria-label="Area tanda tangan"></canvas>
        </div>
        <div class="signature-actions">
          <button type="button" class="${btnSecondary} ${btnSm}" data-act="clear">Hapus Tanda Tangan</button>
          <span class="hint">Gambar dengan mouse, sentuhan, atau stylus.</span>
        </div>
      </div>
      <div class="sig-upload-panel hidden">
        <label class="${btnSecondary} ${btnSm}">Choose File
          <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" hidden />
        </label>
        <div class="sig-upload-preview hidden">
          <div class="page-meta" style="margin-bottom:6px">Tanda Tangan Anda</div>
          <img alt="Preview tanda tangan" />
          <div class="signature-actions">
            <label class="${btnSecondary} ${btnSm}">Ganti File
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" hidden data-replace="1" />
            </label>
            <button type="button" class="${btnSecondary} ${btnSm}" data-act="clear-upload">Hapus</button>
          </div>
        </div>
      </div>
    `;
    this.canvas = this.root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this._resetCanvas();
  }

  _resetCanvas() {
    const ctx = this.ctx;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this._dirty = false;
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  _bind() {
    this.root.querySelectorAll(".sig-tab").forEach((btn) => {
      btn.addEventListener("click", () => this.setMode(btn.getAttribute("data-mode")));
    });
    this.root.querySelector('[data-act="clear"]').addEventListener("click", () => this.clear());
    this.root
      .querySelector('[data-act="clear-upload"]')
      .addEventListener("click", () => this.clear());

    const start = (e) => {
      if (this.mode !== "draw") return;
      e.preventDefault();
      this._drawing = true;
      const p = this._pos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!this._drawing || this.mode !== "draw") return;
      e.preventDefault();
      const p = this._pos(e);
      this.ctx.lineWidth = 2.2;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.strokeStyle = "#111";
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this._dirty = true;
    };
    const end = () => {
      this._drawing = false;
    };

    this.canvas.addEventListener("pointerdown", start);
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointerleave", end);
    this.canvas.addEventListener("pointercancel", end);

    this.root.querySelectorAll('input[type="file"]').forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) this.setUploadedFile(file);
        input.value = "";
      });
    });
  }

  setMode(mode) {
    this.mode = mode === "upload" ? "upload" : "draw";
    this.root.querySelectorAll(".sig-tab").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-mode") === this.mode);
    });
    this.root.querySelector(".sig-draw-panel").classList.toggle("hidden", this.mode !== "draw");
    this.root.querySelector(".sig-upload-panel").classList.toggle("hidden", this.mode !== "upload");
  }

  isEmpty() {
    if (this.mode === "upload") return !this.uploadedFile && !this.uploadedUrl;
    return !this._dirty;
  }

  clear() {
    this._resetCanvas();
    this.uploadedFile = null;
    this.uploadedUrl = "";
    const preview = this.root.querySelector(".sig-upload-preview");
    preview.classList.add("hidden");
    preview.querySelector("img").removeAttribute("src");
  }

  getSource() {
    return this.mode;
  }

  setUploadedFile(file) {
    if (
      !file ||
      (!/^image\/(png|jpe?g|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name))
    ) {
      return;
    }
    this.uploadedFile = file;
    this.setMode("upload");
    const url = URL.createObjectURL(file);
    this.uploadedUrl = url;
    const preview = this.root.querySelector(".sig-upload-preview");
    preview.classList.remove("hidden");
    preview.querySelector("img").src = url;
  }

  getBlob() {
    return new Promise((resolve) => {
      if (this.mode === "upload") {
        resolve(this.uploadedFile || null);
        return;
      }
      if (!this._dirty) {
        resolve(null);
        return;
      }
      this.canvas.toBlob((b) => resolve(b), "image/png");
    });
  }

  async getDataURL() {
    if (this.mode === "upload") {
      if (this.uploadedFile) return fileToDataURL(this.uploadedFile);
      return this.uploadedUrl || "";
    }
    if (!this._dirty) return "";
    return this.canvas.toDataURL("image/png");
  }

  async getPayload() {
    const url = await this.getDataURL();
    if (!url) return null;
    return {
      method: this.mode,
      image_data_url: url,
    };
  }
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
