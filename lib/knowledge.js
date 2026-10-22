const { query } = require("./db");

function buildSearchText(message, history = []) {
  const recent = Array.isArray(history)
    ? history
        .filter((item) => item?.role === "user" && typeof item.text === "string")
        .slice(-4)
        .map((item) => item.text.trim())
    : [];

  return [...recent, String(message || "").trim()]
    .filter(Boolean)
    .join(" ");
}

async function retrieveKnowledge(message, history = [], limit = 6) {
  if (!process.env.DATABASE_URL) return [];

  const searchText = buildSearchText(message, history).slice(0, 3000);
  if (!searchText) return [];

  try {
    const result = await query(
      `WITH q AS (
         SELECT websearch_to_tsquery('spanish', $1) AS tsq
       )
       SELECT
         ki.id,
         ki.title,
         ki.summary,
         ki.content,
         ki.tags,
         ki.priority,
         kc.name AS category,
         ts_rank_cd(
           to_tsvector('spanish',
             coalesce(ki.title,'') || ' ' ||
             coalesce(ki.summary,'') || ' ' ||
             coalesce(ki.content,'') || ' ' ||
             array_to_string(ki.tags, ' ')
           ),
           q.tsq
         ) AS rank
       FROM knowledge_items ki
       LEFT JOIN knowledge_categories kc ON kc.id=ki.category_id
       CROSS JOIN q
       WHERE ki.status='active'
         AND (ki.valid_from IS NULL OR ki.valid_from <= CURRENT_DATE)
         AND (ki.valid_until IS NULL OR ki.valid_until >= CURRENT_DATE)
         AND (
           to_tsvector('spanish',
             coalesce(ki.title,'') || ' ' ||
             coalesce(ki.summary,'') || ' ' ||
             coalesce(ki.content,'') || ' ' ||
             array_to_string(ki.tags, ' ')
           ) @@ q.tsq
           OR similarity(lower(ki.title), lower($1)) > 0.10
           OR EXISTS (
             SELECT 1 FROM unnest(ki.tags) tag
             WHERE lower($1) LIKE '%' || lower(tag) || '%'
                OR lower(tag) LIKE '%' || lower($1) || '%'
           )
         )
       ORDER BY rank DESC, ki.priority DESC, ki.updated_at DESC
       LIMIT $2`,
      [searchText, Math.min(Math.max(Number(limit) || 6, 1), 10)]
    );

    return result.rows;
  } catch (error) {
    console.error("Knowledge retrieval error:", error.message);
    return [];
  }
}

function formatKnowledgeContext(items = []) {
  if (!items.length) return "No se encontró información específica en la base de conocimiento para esta consulta.";

  return items.map((item, index) => {
    const tags = Array.isArray(item.tags) && item.tags.length
      ? `Etiquetas: ${item.tags.join(", ")}`
      : "";

    return [
      `FUENTE ${index + 1}`,
      `Categoría: ${item.category || "Sin categoría"}`,
      `Título: ${item.title}`,
      tags,
      item.content
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n").slice(0, 9000);
}

module.exports = { retrieveKnowledge, formatKnowledgeContext };
