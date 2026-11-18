const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function pageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set([1, total, current - 1, current, current + 1]);

  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

function pageButtons(page, total) {
  const numbers = pageNumbers(page, total);
  const parts = [];

  numbers.forEach((number, index) => {
    const previous = numbers[index - 1];

    if (previous && number - previous > 1) {
      parts.push('<span class="pagination__ellipsis">…</span>');
    }

    parts.push(`
      <button
        type="button"
        class="pagination__page${number === page ? " is-active" : ""}"
        data-page="${number}"
        ${number === page ? 'aria-current="page"' : ""}
        aria-label="Halaman ${number}"
      >
        ${number}
      </button>
    `);
  });

  return parts.join("");
}

export function renderPagination(
  container,
  { page, pageSize, total, onPageChange, onPageSizeChange },
) {
  if (!container) return;

  if (!total) {
    container.innerHTML = "";
    return;
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  container.innerHTML = `
    <div class="pagination">
      <div class="pagination__info">
        Menampilkan <strong>${start}–${end}</strong> dari <strong>${total}</strong>
      </div>

      <div class="pagination__controls">
        <label class="pagination__size">
          <span>Baris</span>
          <select data-page-size aria-label="Jumlah baris per halaman">
            ${PAGE_SIZE_OPTIONS.map(
              (size) => `
                <option value="${size}" ${size === pageSize ? "selected" : ""}>
                  ${size}
                </option>
              `,
            ).join("")}
          </select>
        </label>

        <div class="pagination__pages" aria-label="Navigasi halaman">
          <button
            type="button"
            class="pagination__nav"
            data-page="${current - 1}"
            ${current === 1 ? "disabled" : ""}
            aria-label="Halaman sebelumnya"
          >
            ‹
          </button>

          ${pageButtons(current, pages)}

          <button
            type="button"
            class="pagination__nav"
            data-page="${current + 1}"
            ${current === pages ? "disabled" : ""}
            aria-label="Halaman berikutnya"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.page);

      if (!next || next === current || next < 1 || next > pages) return;

      onPageChange?.(next);
    });
  });

  container.querySelector("[data-page-size]")?.addEventListener("change", (event) => {
    const size = Number(event.target.value);

    if (!size || size === pageSize) return;

    onPageSizeChange?.(size);
  });
}

export function emptyPagination(container) {
  if (container) container.innerHTML = "";
}

export function paginate(items, page, pageSize) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pages,
    total,
  };
}
