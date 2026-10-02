export function requireData(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function createRepairRepository(db) {
  return {
    async getPublic() {
      const [stagesResult, settingsResult] = await Promise.all([
        db.from('repair_stages')
          .select('id,name,description,color,icon,sort_order')
          .order('sort_order'),
        db.from('repair_settings')
          .select('title,stale_days,visible_cards')
          .eq('id', 1)
          .single(),
      ]);
      return {
        stages: requireData(stagesResult),
        settings: requireData(settingsResult),
      };
    },

    async getCases() {
      const rows = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const page = requireData(await db.from('repair_cases')
          .select('id,stage_id,title,address,owner,priority,description,note,opened_on,updated_at')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1));
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },

    async getAccessRequests() {
      return requireData(await db.from('repair_access_requests')
        .select('user_id,email,requested_at')
        .order('requested_at', { ascending: false }));
    },

    async getMembership(userId) {
      return requireData(await db.from('repair_members')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle());
    },

    async requestAccess(userId, email) {
      const result = await db.from('repair_access_requests').insert({ user_id: userId, email });
      if (result.error && result.error.code !== '23505') throw result.error;
    },

    async approveAccess(userId) {
      return requireData(await db.rpc('repair_approve_access', { p_user_id: userId }));
    },

    async reorderStages(ids) {
      return requireData(await db.rpc('repair_reorder_stages', { p_ids: ids }));
    },

    async deleteStage(id) {
      return requireData(await db.from('repair_stages').delete().eq('id', id));
    },

    async deleteCase(id) {
      return requireData(await db.from('repair_cases').delete().eq('id', id));
    },

    async createCase(payload) {
      return requireData(await db.from('repair_cases')
        .insert(payload)
        .select('id,stage_id')
        .single());
    },

    async updateCase(id, previousUpdatedAt, payload) {
      const result = await db.from('repair_cases')
        .update(payload)
        .eq('id', id)
        .eq('updated_at', previousUpdatedAt)
        .select('id,updated_at')
        .maybeSingle();
      return requireData(result);
    },

    async saveStage(id, payload, sortOrder) {
      if (id) {
        return requireData(await db.from('repair_stages')
          .update(payload)
          .eq('id', id)
          .select('id')
          .single());
      }
      return requireData(await db.from('repair_stages')
        .insert({ ...payload, sort_order: sortOrder })
        .select('id')
        .single());
    },

    async saveSettings(payload) {
      return requireData(await db.from('repair_settings')
        .update(payload)
        .eq('id', 1)
        .select('id')
        .single());
    },
  };
}
