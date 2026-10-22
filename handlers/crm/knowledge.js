const { query, withTransaction } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");

function clean(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((v) => clean(v, 80)).filter(Boolean).slice(0, 30);
  }
  return clean(value, 1000)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 30);
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res);
  if (!manager) return;

  if (req.method === "GET") {
    try {
      const [categories, items] = await Promise.all([
        query(
          `SELECT kc.*,
                  (SELECT count(*)::int FROM knowledge_items ki WHERE ki.category_id=kc.id AND ki.status<>'archived') AS item_count
           FROM knowledge_categories kc
           ORDER BY kc.sort_order, kc.name`
        ),
        query(
          `SELECT ki.*, kc.name AS category_name
           FROM knowledge_items ki
           LEFT JOIN knowledge_categories kc ON kc.id=ki.category_id
           ORDER BY
             CASE ki.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
             ki.priority DESC,
             ki.updated_at DESC
           LIMIT 500`
        )
      ]);

      return res.status(200).json({
        success: true,
        categories: categories.rows,
        items: items.rows
      });
    } catch (error) {
      console.error("Knowledge list error:", error);
      return res.status(500).json({ success: false, message: "No se pudo cargar la base de conocimiento." });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  if (!manager.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Solo un administrador puede modificar la base de conocimiento."
    });
  }

  try {
    const { action } = req.body || {};

    if (action === "save-category") {
      const id = clean(req.body?.id, 100) || null;
      const name = clean(req.body?.name, 160);
      const description = clean(req.body?.description, 800) || null;
      const sortOrder = Number(req.body?.sortOrder || 0);
      const active = req.body?.active !== false;

      if (!name) {
        return res.status(400).json({ success: false, message: "La categoría necesita un nombre." });
      }

      const result = id
        ? await query(
            `UPDATE knowledge_categories
             SET name=$2, description=$3, sort_order=$4, active=$5, updated_at=now()
             WHERE id=$1
             RETURNING *`,
            [id, name, description, sortOrder, active]
          )
        : await query(
            `INSERT INTO knowledge_categories(name,description,sort_order,active)
             VALUES($1,$2,$3,$4)
             RETURNING *`,
            [name, description, sortOrder, active]
          );

      return res.status(id ? 200 : 201).json({ success: true, category: result.rows[0] });
    }

    if (action === "save-item") {
      const id = clean(req.body?.id, 100) || null;
      const title = clean(req.body?.title, 260);
      const summary = clean(req.body?.summary, 1200) || null;
      const content = clean(req.body?.content, 20000);
      const categoryId = clean(req.body?.categoryId, 100) || null;
      const tags = parseTags(req.body?.tags);
      const status = ["draft","active","archived"].includes(req.body?.status)
        ? req.body.status
        : "active";
      const priority = Math.min(Math.max(Number(req.body?.priority || 0), 0), 1000);
      const validFrom = clean(req.body?.validFrom, 20) || null;
      const validUntil = clean(req.body?.validUntil, 20) || null;

      if (!title || !content) {
        return res.status(400).json({ success: false, message: "Completa título y contenido." });
      }

      const result = id
        ? await query(
            `UPDATE knowledge_items
             SET category_id=$2,
                 title=$3,
                 summary=$4,
                 content=$5,
                 tags=$6::text[],
                 status=$7,
                 priority=$8,
                 valid_from=$9,
                 valid_until=$10,
                 updated_by=$11,
                 updated_at=now()
             WHERE id=$1
             RETURNING *`,
            [id, categoryId, title, summary, content, tags, status, priority, validFrom, validUntil, manager.sub]
          )
        : await query(
            `INSERT INTO knowledge_items(
               category_id,title,summary,content,tags,status,priority,valid_from,valid_until,
               created_by,updated_by
             )
             VALUES($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$10)
             RETURNING *`,
            [categoryId, title, summary, content, tags, status, priority, validFrom, validUntil, manager.sub]
          );

      return res.status(id ? 200 : 201).json({ success: true, item: result.rows[0] });
    }

    if (action === "archive-item" || action === "restore-item") {
      const id = clean(req.body?.id, 100);
      if (!id) return res.status(400).json({ success: false, message: "Falta id." });

      const status = action === "archive-item" ? "archived" : "active";
      const result = await query(
        `UPDATE knowledge_items
         SET status=$2, updated_by=$3, updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [id, status, manager.sub]
      );

      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: "Contenido no encontrado." });
      }

      return res.status(200).json({ success: true, item: result.rows[0] });
    }

    if (action === "delete-category") {
      const id = clean(req.body?.id, 100);
      if (!id) return res.status(400).json({ success: false, message: "Falta id." });

      const count = await query(
        "SELECT count(*)::int AS count FROM knowledge_items WHERE category_id=$1",
        [id]
      );

      if (count.rows[0]?.count > 0) {
        return res.status(409).json({
          success: false,
          message: "La categoría contiene información. Mueve o archiva sus elementos antes de eliminarla."
        });
      }

      await query("DELETE FROM knowledge_categories WHERE id=$1", [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, message: "Acción inválida." });
  } catch (error) {
    console.error("Knowledge update error:", error);
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Ya existe una categoría con ese nombre." });
    }
    return res.status(500).json({ success: false, message: "No se pudo actualizar la base de conocimiento." });
  }
};
