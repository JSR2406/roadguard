CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor BETWEEN 1 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CAD', 'EUR', 'GBP')),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, sku),
  UNIQUE (id, workspace_id)
) STRICT;

CREATE INDEX IF NOT EXISTS products_workspace_idx
  ON products(workspace_id, status, created_at);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CAD', 'EUR', 'GBP')),
  discount_rate_units INTEGER NOT NULL CHECK (discount_rate_units BETWEEN 0 AND 1000000),
  tax_rate_units INTEGER NOT NULL CHECK (tax_rate_units BETWEEN 0 AND 1000000),
  tax_mode TEXT NOT NULL CHECK (tax_mode IN ('exclusive', 'inclusive')),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor BETWEEN 0 AND 9007199254740991),
  discount_minor INTEGER NOT NULL CHECK (discount_minor BETWEEN 0 AND 9007199254740991),
  taxable_subtotal_minor INTEGER NOT NULL CHECK (taxable_subtotal_minor BETWEEN 0 AND 9007199254740991),
  tax_minor INTEGER NOT NULL CHECK (tax_minor BETWEEN 0 AND 9007199254740991),
  grand_total_minor INTEGER NOT NULL CHECK (grand_total_minor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, workspace_id, currency)
) STRICT;

CREATE INDEX IF NOT EXISTS quotes_workspace_idx
  ON quotes(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CAD', 'EUR', 'GBP')),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 9007199254740991),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
  line_subtotal_minor INTEGER NOT NULL CHECK (line_subtotal_minor BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (quote_id, workspace_id, currency) REFERENCES quotes(id, workspace_id, currency) ON DELETE CASCADE,
  FOREIGN KEY (product_id, workspace_id) REFERENCES products(id, workspace_id)
) STRICT;

CREATE INDEX IF NOT EXISTS quote_lines_quote_idx
  ON quote_lines(quote_id, id);

CREATE INDEX IF NOT EXISTS quote_lines_workspace_idx
  ON quote_lines(workspace_id, quote_id);

-- Snapshots and their calculated totals are never edited after creation.
CREATE TRIGGER IF NOT EXISTS quote_lines_no_update
  BEFORE UPDATE ON quote_lines
  BEGIN
    SELECT RAISE(ABORT, 'quote lines are immutable');
  END;

CREATE TRIGGER IF NOT EXISTS quotes_no_update
  BEFORE UPDATE ON quotes
  BEGIN
    SELECT RAISE(ABORT, 'quotes are immutable');
  END;
