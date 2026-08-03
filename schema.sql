-- Splatoon Raider 共享零件库数据库表结构
-- 数据库: splatoon-raider-db (D1)

-- 零件表：同时存放"正式库"和"待审核"零件，用 status 区分
CREATE TABLE IF NOT EXISTS plugins (
  id            TEXT PRIMARY KEY,                 -- 唯一 ID，格式 plugin-{uuid}
  skill_id      TEXT NOT NULL,                    -- 所属配件 ID，关联 skills[].id (如 speed-1)
  name          TEXT NOT NULL,                    -- 零件名称 (≤40 字符)
  slot_cost     INTEGER NOT NULL,                 -- 占用成本 (≥0)
  quality       TEXT NOT NULL,                    -- 品质枚举: white/green/purple/gold/rainbow
  effect_text   TEXT NOT NULL DEFAULT '',         -- 效果说明 (≤120 字符)
  bonus_text    TEXT NOT NULL DEFAULT '',         -- 加成文本 (≤30 字符)
  image         TEXT NOT NULL DEFAULT '',         -- 图片：base64 dataURL 或空串
  status        TEXT NOT NULL DEFAULT 'pending',  -- 状态: pending(待审核)/approved(已通过)/rejected(已拒绝)
  submitted_by  TEXT,                             -- 提交者标识 (可选，昵称或 IP 哈希)
  created_at    TEXT NOT NULL,                    -- 创建/提交时间 (ISO 字符串)
  reviewed_at   TEXT,                             -- 审核时间 (ISO 字符串，未审核为 NULL)
  deleted_at    TEXT                              -- 软删除时间 (仅 approved 可软删，NULL=未删)
);

-- 索引：加速常用查询
CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_skill ON plugins(skill_id);
