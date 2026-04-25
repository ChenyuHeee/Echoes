-- ============================================================
-- 《回响：破碎时间》Supabase 数据库架构
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 玩家档案表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_skin TEXT DEFAULT 'default',
  level INTEGER DEFAULT 1,
  time_sand BIGINT DEFAULT 100,          -- 时砂（货币）
  echo_fragments INTEGER DEFAULT 0,      -- 回响碎片（高级货币）
  total_playtime INTEGER DEFAULT 0,      -- 总游戏时间（秒）
  faction TEXT DEFAULT NULL,             -- 阵营：rectifiers/weavers/void
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 技能记忆表（玩家解锁的技能）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.skill_memories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,               -- 技能唯一标识
  skill_name TEXT NOT NULL,
  mastery_level INTEGER DEFAULT 0,      -- 精通等级 0-5
  times_used INTEGER DEFAULT 0,
  echo_count INTEGER DEFAULT 0,         -- 被回响触发次数
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, skill_id)
);

-- ============================================================
-- 装备模块表（枪械模块）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equipment_modules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  rarity TEXT DEFAULT 'common',         -- common/rare/epic/paradox
  echo_modifier JSONB DEFAULT '{}',     -- 对回响系统的特殊修改
  acquired_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 回响庇护所表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sanctuaries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE UNIQUE,
  sanctuary_name TEXT DEFAULT '我的庇护所',
  theme TEXT DEFAULT 'steampunk',
  buildings JSONB DEFAULT '[]',         -- 建筑列表
  decorations JSONB DEFAULT '[]',
  time_sand_rate INTEGER DEFAULT 10,   -- 每小时产出时砂
  last_harvest TIMESTAMPTZ DEFAULT NOW(),
  is_public BOOLEAN DEFAULT TRUE,       -- 是否允许访问
  visitor_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 深潜记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dive_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  session_id UUID,                      -- 多人同局 ID
  map_fragment TEXT NOT NULL,           -- 碎片地图名称
  result TEXT NOT NULL,                 -- success/death/abandon
  time_sand_gained INTEGER DEFAULT 0,
  crystals_found JSONB DEFAULT '[]',    -- 找到的记忆水晶
  duration INTEGER DEFAULT 0,          -- 持续时间（秒）
  kills INTEGER DEFAULT 0,
  death_cause TEXT,
  echo_sequence JSONB DEFAULT '[]',     -- 本次使用的技能序列记录
  played_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 完美回响水晶表（永久解析的特殊技能）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfect_echoes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  crystal_id TEXT NOT NULL,
  crystal_name TEXT NOT NULL,
  description TEXT,
  echo_enhancement JSONB NOT NULL,     -- 对回响系统的特殊增强
  source_fragment TEXT,                 -- 来自哪个碎片
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, crystal_id)
);

-- ============================================================
-- 游戏大厅/房间表（用于 Realtime 联机）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,       -- 6位房间码
  room_type TEXT NOT NULL,              -- dive/void_storm/arena
  host_id UUID REFERENCES public.player_profiles(id),
  max_players INTEGER DEFAULT 3,
  current_players INTEGER DEFAULT 1,
  status TEXT DEFAULT 'waiting',        -- waiting/in_progress/finished
  map_fragment TEXT,
  difficulty TEXT DEFAULT 'normal',
  room_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 房间玩家表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  is_ready BOOLEAN DEFAULT FALSE,
  loadout JSONB DEFAULT '{}',           -- 选择的技能/装备
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, player_id)
);

-- ============================================================
-- 排行榜（时序竞技场）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_arena (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  season INTEGER DEFAULT 1,
  elo_rating INTEGER DEFAULT 1000,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  echo_accuracy FLOAT DEFAULT 0,       -- 回响精准率（技术指标）
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, season)
);

-- ============================================================
-- 全服事件表（时震事件）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.world_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_name TEXT NOT NULL,
  description TEXT,
  event_type TEXT,                      -- time_quake/fragment_emerge/story
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  rewards JSONB DEFAULT '{}',
  participants JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- 玩家成就/故事进度表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.story_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_id UUID REFERENCES public.player_profiles(id) ON DELETE CASCADE UNIQUE,
  main_chapter INTEGER DEFAULT 0,
  discovered_lore JSONB DEFAULT '[]',  -- 发现的环境故事碎片
  npc_relationships JSONB DEFAULT '{}', -- 与NPC的关系值
  faction_standing JSONB DEFAULT '{"rectifiers":0,"weavers":0,"void_seekers":0}',
  choices_made JSONB DEFAULT '[]',      -- 重要选择记录
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS) 策略
-- ============================================================

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dive_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfect_echoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_arena ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_progress ENABLE ROW LEVEL SECURITY;

-- 玩家档案：自己可读写，他人可读公开信息
CREATE POLICY "profile_select_own" ON public.player_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profile_insert_own" ON public.player_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profile_update_own" ON public.player_profiles FOR UPDATE USING (auth.uid() = id);

-- 技能记忆：仅自己操作
CREATE POLICY "skills_own" ON public.skill_memories FOR ALL USING (auth.uid() = player_id);

-- 装备：仅自己操作
CREATE POLICY "equipment_own" ON public.equipment_modules FOR ALL USING (auth.uid() = player_id);

-- 庇护所：自己可读写，公开的他人可读
CREATE POLICY "sanctuary_own" ON public.sanctuaries FOR ALL USING (auth.uid() = player_id);
CREATE POLICY "sanctuary_public_read" ON public.sanctuaries FOR SELECT USING (is_public = TRUE);

-- 深潜记录：仅自己
CREATE POLICY "dive_own" ON public.dive_records FOR ALL USING (auth.uid() = player_id);

-- 完美回响：仅自己
CREATE POLICY "echoes_own" ON public.perfect_echoes FOR ALL USING (auth.uid() = player_id);

-- 游戏房间：已认证用户可读，主机可写
CREATE POLICY "rooms_read" ON public.game_rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_insert" ON public.game_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "rooms_update_host" ON public.game_rooms FOR UPDATE USING (auth.uid() = host_id);

-- 房间玩家：房间内玩家可读写
CREATE POLICY "room_players_read" ON public.room_players FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "room_players_own" ON public.room_players FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "room_players_update" ON public.room_players FOR UPDATE USING (auth.uid() = player_id);
CREATE POLICY "room_players_delete" ON public.room_players FOR DELETE USING (auth.uid() = player_id);

-- 排行榜：所有认证用户可读
CREATE POLICY "leaderboard_read" ON public.leaderboard_arena FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "leaderboard_own" ON public.leaderboard_arena FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "leaderboard_update" ON public.leaderboard_arena FOR UPDATE USING (auth.uid() = player_id);

-- 故事进度：仅自己
CREATE POLICY "story_own" ON public.story_progress FOR ALL USING (auth.uid() = player_id);

-- 世界事件：所有认证用户可读
ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read" ON public.world_events FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sanctuaries_updated_at
  BEFORE UPDATE ON public.sanctuaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_game_rooms_updated_at
  BEFORE UPDATE ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 函数：新用户注册时自动创建档案
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.player_profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'echo_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', '新回响体')
  );
  
  INSERT INTO public.sanctuaries (player_id)
  VALUES (NEW.id);
  
  INSERT INTO public.story_progress (player_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 函数：生成唯一房间码
-- ============================================================
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 索引优化
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_skill_memories_player ON public.skill_memories(player_id);
CREATE INDEX IF NOT EXISTS idx_equipment_player ON public.equipment_modules(player_id);
CREATE INDEX IF NOT EXISTS idx_dive_records_player ON public.dive_records(player_id);
CREATE INDEX IF NOT EXISTS idx_dive_records_session ON public.dive_records(session_id);
CREATE INDEX IF NOT EXISTS idx_perfect_echoes_player ON public.perfect_echoes(player_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON public.room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_season ON public.leaderboard_arena(season, elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON public.game_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON public.game_rooms(status);
