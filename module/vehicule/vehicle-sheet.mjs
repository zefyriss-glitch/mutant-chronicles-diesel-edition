// -------------------------------------------------------
// Damage Bonus helper (PCs): supports both data paths
// - NEW (character sheet): system.damageBonus.ranged / melee
// - OLD/other sheets:      system.damage_bonus.ranged.value / melee.value
// -------------------------------------------------------
function getDamageBonus(actor, mode = "ranged") {
  const sys = actor?.system ?? {};

  const vNew = mode === "melee"
    ? sys.damageBonus?.melee
    : sys.damageBonus?.ranged;

  const vOld = mode === "melee"
    ? sys.damage_bonus?.melee?.value
    : sys.damage_bonus?.ranged?.value;

  return Number(vNew ?? vOld ?? 0) || 0;
}

export class MCDEVehicleSheet extends ActorSheet {
  static SYSTEM_ID = "mutant-chronicles-diesel-edition";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mcde", "sheet", "actor", "vehicle"],
      template: "systems/mutant-chronicles-diesel-edition/templates/actor/vehicle-sheet.html",
      width: 860,
      height: 720,
      tabs: [{ navSelector: ".mcde-tabs", contentSelector: ".mcde-tab-content", initial: "tactical" }]
    });
  }

  async getData(options) {
    const context = await super.getData(options);

    // Your usual aliases
    context.system = this.actor.system ?? {};
    context.locations = context.system.locations ?? {};

    // --- Vehicle Tags (qualities) ---
    context.system.vehicleTags = Array.isArray(context.system?.vehicleTags) ? context.system.vehicleTags : [];
    context.vehicleTags = context.system.vehicleTags;

    // --- Armaments (embedded weapons on the vehicle) ---
    const SYSTEM_ID = MCDEVehicleSheet.SYSTEM_ID;
    const weapons = (this.actor.items ?? []).filter(i => i.type === "weapon");
    const armaments = [];
    for (const w of weapons) {
      const gunnerUuid =
        w.getFlag?.(SYSTEM_ID, "gunnerUuid") ??
        w.flags?.[SYSTEM_ID]?.gunnerUuid ??
        "";

      let gunner = null;
      if (gunnerUuid) {
        try {
          const a = await fromUuid(gunnerUuid);
          if (a?.documentName === "Actor") gunner = { uuid: gunnerUuid, name: a.name, img: a.img };
        } catch (e) {}
      }

      armaments.push({
        id: w.id,
        name: w.name,
        img: w.img,
        system: w.system ?? {},
        gunner
      });
    }
    context.armaments = armaments;

    // Resolve pilot actor for display (if any)
    context.crewPilot = null;
    const pilotUuid = context.system?.crew?.pilotUuid;
    if (pilotUuid) {
      try {
        const pilot = await fromUuid(pilotUuid);
        if (pilot?.documentName === "Actor") {
          context.crewPilot = { name: pilot.name, img: pilot.img, uuid: pilotUuid };
        }
      } catch (e) {
        // ignore bad uuid
      }
    }

    return context;
  }

  async activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Click location boxes
    html.on("click", ".mcde-box", async (ev) => {
  ev.preventDefault();

  const el = ev.currentTarget;
  const locKey = el.dataset.loc;
  const track = el.dataset.track;
  const idx = Number(el.dataset.idx ?? 0) || 0;

  const current = Number(
    this.actor.system?.locations?.[locKey]?.[track] ?? 0
  );

  let next;

  // Click on the current filled value → reset to 0
  if (idx === current) {
    next = 0;
  }
  // Click below current → reduce
  else if (idx < current) {
    next = idx;
  }
  // Click above current → increase
  else {
    next = idx;
  }

  await this.actor.update({
    [`system.locations.${locKey}.${track}`]: next
  });
});

  const root = html[0]; // <-- UNE SEULE FOIS ICI

  // ========================================
// Reload bandolier (Vehicle sheet)
// ========================================
html.off("click.mcdeReloadVeh", ".mcde-reload-bullet, .mcde-reload-bandolier img");
html.on("click.mcdeReloadVeh", ".mcde-reload-bullet, .mcde-reload-bandolier img", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const bullet = ev.currentTarget;
  const bandolier =
    bullet.closest(".mcde-reload-bandolier") ||
    bullet.parentElement?.closest?.(".mcde-reload-bandolier");

  if (!bandolier) return;

  const value = Number(bullet.dataset?.value ?? bandolier.dataset?.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return;

  const itemId =
    bandolier.dataset.itemId ||
    bandolier.dataset.itemid ||
    bandolier.getAttribute("data-item-id") ||
    bandolier.getAttribute("data-itemid");

  if (!itemId) return;

  const item = this.actor?.items?.get(itemId);
  if (!item) return;

  const max = Number(item.system?.reload?.max ?? bandolier.dataset.max ?? 10) || 10;
  const current = Number(item.system?.reload?.current ?? item.system?.reloadUsed ?? bandolier.dataset.current ?? 0) || 0;

  let newValue = (value <= current) ? (value - 1) : value;
  newValue = Math.max(0, Math.min(max, newValue));

  await item.update({
    "system.reload.max": max,
    "system.reload.current": newValue,
    "system.reloadUsed": newValue
  });

  this.render(false);
});

    // Pilot test button
    html.on("click", "[data-action='pilot-test']", (ev) => {
      ev.preventDefault();
      this._openPilotTestDialog();
    });

    // Drop zone for pilot
    // Drop zone for pilot
const dropEl = root?.querySelector(".mcde-pilot-drop[data-drop='pilot']");
if (dropEl) {
  dropEl.addEventListener("dragover", (ev) => ev.preventDefault());
  dropEl.addEventListener("drop", (ev) => this._onDropPilot(ev));
}

    // Clear pilot
    html.on("click", "[data-action='clear-pilot']", async (ev) => {
      ev.preventDefault();
      await this.actor.update({ "system.crew.pilotUuid": "" });
    });

    // Impact damage button
html.find("[data-action='roll-impact-damage']")
  .off("click.mcdeImpact")
  .on("click.mcdeImpact", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    console.log("MCDE | roll impact damage clicked");
    try {
      await this._rollImpactDamage();
    } catch (err) {
      console.error("MCDE | roll impact damage failed", err);
      ui.notifications?.error?.("Impact Damage roll failed — see console (F12).");
    }
  });


    // =========================================================
// Vehicle Tags (drop Quality) + remove + tooltip
// =========================================================
const tagsDrop = root?.querySelector(".mcde-vehicle-tags-dropzone");
if (tagsDrop) {
  tagsDrop.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });
  tagsDrop.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
    this._onDropVehicleTag(ev);
  });
}

// ===============================
// Vehicle Tags — Rich tooltip (rust)
// ===============================
const tagEls = root?.querySelectorAll?.(".mcde-vehicle-tags-dropzone .mcde-tag") ?? [];
for (const el of tagEls) {
  const raw = el.dataset.mcdeDesc ?? "";
  if (!raw) continue;
  if (el.dataset.tooltipReady === "1") continue;
  el.dataset.tooltipReady = "1";

  let enriched = "";
  try {
    enriched = await TextEditor.enrichHTML(raw, { async: true });
  } catch (e) {
    console.warn("MCDE | Vehicle tag tooltip enrich failed", e);
    enriched = raw;
  }

  el.dataset.tooltip = enriched;
}

html.find(".mcde-vehicle-tags-dropzone .mcde-tag")
  .off("mouseenter.mcdeVehTagTip mouseleave.mcdeVehTagTip")
  .on("mouseenter.mcdeVehTagTip", (ev) => {
    const el = ev.currentTarget;
    const text = el?.dataset?.tooltip;
    if (!text) return;
    ui?.tooltip?.activate?.(el, { text });
  })
  .on("mouseleave.mcdeVehTagTip", () => {
    ui?.tooltip?.deactivate?.();
  });

// Remove vehicle tag
html.off("click.mcdeVehTagRemove", "[data-action='vehicle-tag-remove']");
html.on("click.mcdeVehTagRemove", "[data-action='vehicle-tag-remove']", async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  const idx = Number(ev.currentTarget.dataset.index ?? -1);
  const cur = Array.isArray(this.actor.system?.vehicleTags) ? [...this.actor.system.vehicleTags] : [];
  if (idx < 0 || idx >= cur.length) return;

  cur.splice(idx, 1);
  await this.actor.update({ "system.vehicleTags": cur });
  this.render(false);
});

    // =========================================================
    // Armaments (drop Weapon) + edit/delete + attack
    // =========================================================
    const armDrop = root?.querySelector(".mcde-veh-armaments-dropzone");
    if (armDrop) {
      armDrop.addEventListener("dragover", (ev) => ev.preventDefault());
      armDrop.addEventListener("drop", (ev) => this._onDropArmamentWeapon(ev));
    }

    html.off("click.mcdeVehWeaponEdit", "[data-action='veh-weapon-edit']");
    html.on("click.mcdeVehWeaponEdit", "[data-action='veh-weapon-edit']", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.off("click.mcdeVehWeaponDelete", "[data-action='veh-weapon-delete']");
    html.on("click.mcdeVehWeaponDelete", "[data-action='veh-weapon-delete']", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      await item.delete();
      this.render(false);
    });

    // Gunner drop per weapon row
    html.find(".mcde-gunner-drop[data-drop='gunner']").each((_, el) => {
      el.addEventListener("dragover", (ev) => ev.preventDefault());
      el.addEventListener("drop", (ev) => this._onDropGunnerForWeapon(ev));
    });

    html.off("click.mcdeVehGunnerClear", "[data-action='veh-gunner-clear']");
    html.on("click.mcdeVehGunnerClear", "[data-action='veh-gunner-clear']", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      const w = this.actor.items.get(itemId);
      if (!w) return;
      await w.unsetFlag(MCDEVehicleSheet.SYSTEM_ID, "gunnerUuid");
      this.render(false);
    });

    // Click weapon attack (uses gunner stats, weapon from vehicle)
    html.off("click.mcdeVehWeaponAttack", "[data-action='veh-weapon-attack']");
    html.on("click.mcdeVehWeaponAttack", "[data-action='veh-weapon-attack']", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const itemId = ev.currentTarget.dataset.itemId;
      const weapon = this.actor.items.get(itemId);
      if (!weapon) return;
      await this._openVehicleWeaponAttackDialog(weapon);
    });

  // Fuel Boxes (toggle, and use fuel.cur consistently)
  html.off("click.mcdeFuel", ".mcde-fuel-box");
  html.on("click.mcdeFuel", ".mcde-fuel-box", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const el = ev.currentTarget;
    const idx = Number(el.dataset.idx ?? 0) || 0;

    const fuel = this.actor.system?.fuel ?? {};
    const current = Number(fuel.cur ?? fuel.value ?? 0) || 0; // tolère l'ancien champ si encore présent
    const max = Number(fuel.max ?? 0) || 0;

    // Re-clic sur la valeur courante => reset à 0, sinon set idx
    let next = (idx === current) ? 0 : idx;
    // Clamp
    if (max > 0) next = Math.min(next, max);
    next = Math.max(0, next);

    await this.actor.update({ "system.fuel.cur": next }, { render: true });
    this.render(false);
  });

// Clamp Fuel when inputs change
html.on("change", "input[name='system.fuel.cur'], input[name='system.fuel.max']", async (ev) => {
  if (!this.actor?.isOwner) return;

  const fuel = this.actor.system?.fuel ?? {};
  let cur = Number(fuel.cur ?? 0) || 0;
  let max = Number(fuel.max ?? 0) || 0;

  // Sanitize
  max = Math.max(0, max);
  cur = Math.max(0, cur);

  // Clamp cur to max
  if (cur > max) cur = max;

  await this.actor.update({
    "system.fuel.max": max,
    "system.fuel.cur": cur
  }, { render: true });

  this.render(false);
});

// Loc Car Doll Boxes (stretched segments): toggle to 0 when clicking current value
  html.off("click.mcdeStretch", ".mcde-stretch-seg");
  html.on("click.mcdeStretch", ".mcde-stretch-seg", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    if (!this.actor?.isOwner) return;

    const el = ev.currentTarget;
    const locKey = el.dataset.loc;
    const track = el.dataset.track;
    const idx = Number(el.dataset.idx ?? 0) || 0;

    const current = Number(this.actor.system?.locations?.[locKey]?.[track] ?? 0) || 0;

    // SHIFT = reset hard à 0 (optionnel mais pratique),
    // sinon toggle: reclic valeur courante => 0, sinon => idx
    const next = ev.shiftKey ? 0 : ((idx === current) ? 0 : idx);
    const path = `system.locations.${locKey}.${track}`;

    await this.actor.update({ [path]: next }, { render: true });
    this.render(false);
  });
  }

  async _rollImpactDamage() {
  const vehicle = this.actor;

  const base = Number(vehicle.system?.impactdamage?.base ?? 0) || 0;
  const dsd  = Math.max(0, Number(vehicle.system?.impactdamage?.dsy ?? 0) || 0);

  // Optionnel: petit garde-fou si tout est à 0
  if (base <= 0 && dsd <= 0) {
    ui.notifications?.warn?.("Impact Damage is 0 (Base and DSD).");
    return;
  }

  // Réutilise ton pipeline Damage card + DSD faces + location d20
  console.log("MCDE | impact payload", { base, dsd, hasApi: !!game.mcde?.rollDamage });
  await game.mcde.rollDamage({
    actor: vehicle,
    weaponName: `Impact Damage — ${vehicle.name ?? "Vehicle"}`,
    mode: "impact",
    dsdCount: dsd,
    flatBonus: base,
    attackData: {
      kind: "impact",
      vehicleUuid: vehicle.uuid
    }
  });
}

  async _onDropPilot(ev) {
    ev.preventDefault();

    let data;
    try {
      data = JSON.parse(ev.dataTransfer.getData("text/plain"));
    } catch (e) {
      return;
    }

    if (data?.type !== "Actor" || !data.uuid) return;

    const doc = await fromUuid(data.uuid);
    if (!doc || doc.documentName !== "Actor") return;

    await this.actor.update({ "system.crew.pilotUuid": doc.uuid });
  }

  // =========================================================
  // Drops
  // =========================================================
  async _onDropVehicleTag(ev) {
    ev.preventDefault();
   ev.stopPropagation();

    let data;
    try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? "{}"); }
    catch { return; }

    let doc = null;
    try {
      if (data?.type === "Item" && data?.id) doc = game.items?.get?.(data.id) ?? null;
      if (!doc && data?.uuid) doc = await fromUuid(data.uuid);
    } catch (e) {}

    if (!doc || doc.type !== "quality") return;

    const cur = Array.isArray(this.actor.system?.vehicleTags) ? [...this.actor.system.vehicleTags] : [];
    const uuid = doc.uuid ?? "";
    if (uuid && cur.some(t => t.uuid === uuid)) return;

    cur.push({
      uuid,
      name: doc.name,
      description: String(doc.system?.description ?? doc.system?.notes ?? "")
    });

    await this.actor.update({ "system.vehicleTags": cur });
    this.render(false);
  }

  async _onDropArmamentWeapon(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    let data;
    try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? "{}"); }
    catch { return; }

    let doc = null;
    try {
      if (data?.uuid) doc = await fromUuid(data.uuid);
      else if (data?.type === "Item" && data?.id) doc = game.items?.get?.(data.id) ?? null;
    } catch (e) {}

    if (!doc || doc.type !== "weapon") return;

    // Prevent duplicates (same sourceId/uuid)
    const sourceId = doc.uuid ?? doc.flags?.core?.sourceId ?? "";
    if (sourceId) {
      const exists = this.actor.items.some(i =>
        i.type === "weapon" &&
        ((i.flags?.core?.sourceId === sourceId) || (i.uuid === sourceId) || (i.getFlag?.(MCDEVehicleSheet.SYSTEM_ID,"sourceUuid") === sourceId))
      );
      if (exists) return;
    }

    await this.actor.createEmbeddedDocuments("Item", [{
      name: doc.name,
      type: "weapon",
      img: doc.img,
      system: foundry.utils.duplicate(doc.system ?? {}),
      flags: {
        ...foundry.utils.duplicate(doc.flags ?? {}),
        [MCDEVehicleSheet.SYSTEM_ID]: { sourceUuid: (doc.uuid ?? "") }
      }
    }]);

    this.render(false);
  }

  async _onDropGunnerForWeapon(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const dropEl = ev.currentTarget;
    const weaponId = dropEl?.dataset?.weaponId;
    if (!weaponId) return;

    let data;
    try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? "{}"); }
    catch { return; }

    if (data?.type !== "Actor" || !data?.uuid) return;
    const actor = await fromUuid(data.uuid);
    if (!actor || actor.documentName !== "Actor") return;

    const weapon = this.actor.items.get(weaponId);
    if (!weapon) return;

    await weapon.setFlag(MCDEVehicleSheet.SYSTEM_ID, "gunnerUuid", actor.uuid);
    this.render(false);
  }

  // =========================================================
  // Vehicle weapon attack (gunner stats, vehicle weapon)
  // =========================================================
  async _openVehicleWeaponAttackDialog(weapon) {
    const SYSTEM_ID = MCDEVehicleSheet.SYSTEM_ID;

    // Resolve gunner
    const gunnerUuid =
      weapon.getFlag?.(SYSTEM_ID, "gunnerUuid") ??
      weapon.flags?.[SYSTEM_ID]?.gunnerUuid ??
      "";

    if (!gunnerUuid) {
      ui.notifications?.warn?.("No gunner assigned to this weapon.");
      return;
    }

    const gunner = await fromUuid(gunnerUuid);
    if (!gunner || gunner.documentName !== "Actor") {
      ui.notifications?.warn?.("Invalid gunner reference.");
     return;
    }

    // Same basics as “normal attack”
    const actor = gunner;
    const chronicleCurrent = Number(actor.system?.chronicle_points?.current ?? 0) || 0;

    const wt = String(weapon.system?.weaponType ?? "ranged").toLowerCase();

const RULES = {
  melee:   { attr: "agility",      skill: "close_combat",   dmgBonus: "melee"  },
  unarmed: { attr: "agility",      skill: "unarmed_combat", dmgBonus: "melee"  },

  ranged:  { attr: "coordination", skill: "ranged_weapons", dmgBonus: "ranged" },
  heavy:   { attr: "coordination", skill: "heavy_weapons",  dmgBonus: "ranged" },
  mounted: { attr: "coordination", skill: "gunnery",        dmgBonus: "ranged" }
};

const rule = RULES[wt] ?? RULES.ranged;
const isRanged = (rule.dmgBonus === "ranged"); // compat pour le reste du code

const attrKey = rule.attr;
const skillKey = rule.skill;

    const attrVal = Number(actor.system?.attributes?.[attrKey]?.value ?? 0) || 0;
    const exp = Number(actor.system?.skills?.[skillKey]?.expertise ?? 0) || 0;
    const foc = Number(actor.system?.skills?.[skillKey]?.focus ?? 0) || 0;
    const tn = attrVal + exp;
    const focus = foc;

    const wName = weapon.name ?? "Weapon";
    const wMode = String(weapon.system?.stats?.mode ?? "");
    const qualities = Array.isArray(weapon.system?.qualities) ? weapon.system.qualities : [];

    const hasUnwieldy =
      String(weapon.system?.stats?.size ?? "").toLowerCase() === "unwieldy" ||
      qualities.some(q => String(q?.name ?? "").toLowerCase() === "unwieldy");

    const canLetRip = isRanged && wMode && wMode.toLowerCase() !== "munition";
    const baseLetRipMax =
      !canLetRip ? 0 :
      (wMode.toLowerCase() === "semi-automatic" ? 1 :
       wMode.toLowerCase() === "burst" ? 2 :
       wMode.toLowerCase() === "automatic" ? 3 : 0);

    const getDSP = () => Number(game.settings.get(SYSTEM_ID, "darkSymmetryPool") ?? 0) || 0;
    const setDSP = (v) => game.settings.set(SYSTEM_ID, "darkSymmetryPool", Number(v) || 0);

    const content = `
      <form class="mcde-roll-dialog" style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:14px;">
            Vehicle Weapon Attack — ${foundry.utils.escapeHTML(wName)}
          </div>
          <div style="opacity:0.75; font-size:12px;">
            Gunner: <strong>${foundry.utils.escapeHTML(actor.name ?? "Gunner")}</strong> • TN <strong>${tn}</strong> • Focus <strong>${focus}</strong>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Buy extra d20 (1 DSP each)</span>
            <select name="extraDice">
              <option value="0" selected>0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>

          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Surprise (+1d20)</span>
            <input type="checkbox" name="surprise">
          </label>

          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Exploit Weakness (+2d20)</span>
            <input type="checkbox" name="exploit">
          </label>

          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Use Chronicle Point (adds 1 die set to 1)</span>
            <input type="checkbox" name="useChronicle" ${chronicleCurrent > 0 ? "" : "disabled"}>
          </label>
        </div>

        ${hasUnwieldy ? `
          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Brace (avoid Unwieldy +2 Difficulty)</span>
            <input type="checkbox" name="brace">
          </label>
        ` : ``}

        ${canLetRip ? `
          <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span>Let Rip</span>
            <select name="letRip">
              ${Array.from({length: baseLetRipMax + 1}, (_,i)=>`<option value="${i}" ${i===0?"selected":""}>${i}</option>`).join("")}
            </select>
          </label>
        ` : ``}
      </form>
    `;

    new Dialog({
      title: "Attack",
      content,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (dlgHtml) => {
            const extraDice = Number(dlgHtml.find("[name='extraDice']").val() ?? 0) || 0;
            const surprise = !!dlgHtml.find("[name='surprise']")[0]?.checked;
            const exploit = !!dlgHtml.find("[name='exploit']")[0]?.checked;
            const brace = !!dlgHtml.find("[name='brace']")[0]?.checked;
            const useChronicle = !!dlgHtml.find("[name='useChronicle']")[0]?.checked;
            const letRip = Number(dlgHtml.find("[name='letRip']").val() ?? 0) || 0;

            // Pay DSP cost for bought dice (same rule as usual)
            if (extraDice > 0) {
              const cur = await getDSP();
              await setDSP(cur + extraDice);
            }

            // Spend ammo for Let Rip (weapon belongs to vehicle)
            if (isRanged && letRip > 0) {
              const curAmmo = Number(weapon.system?.reload?.current ?? weapon.system?.reloadUsed ?? 0) || 0;
              if (curAmmo < letRip) {
                ui.notifications?.warn?.("Not enough ammo for Let Rip.");
                return;
              }
              const newAmmo = curAmmo - letRip;
              await weapon.update({
                "system.reload.current": newAmmo,
                "system.reloadUsed": newAmmo
              });
            }

            // Spend Chronicle (gunner)
            if (useChronicle) {
              const cpCur = Number(actor.system?.chronicle_points?.current ?? 0) || 0;
              if (cpCur <= 0) {
                ui.notifications?.warn?.("Not enough Chronicle Points.");
                return;
              }
              await actor.update({ "system.chronicle_points.current": cpCur - 1 });
            }

            // Dice count (base 2 like your standard dialog)
            let diceCount = 2;
            diceCount += Math.max(0, Math.min(3, extraDice));
            if (exploit) diceCount += 2;
            if (surprise) diceCount += 1;
            if (letRip > 0) diceCount += letRip;

            // Difficulty (unwieldy)
            let difficulty = 1;
            if (isRanged && hasUnwieldy && !brace) difficulty += 2;

            // Damage payload (precomputed so chat damage roll works even though actor != weapon owner)
            const mode = isRanged ? "ranged" : "melee";
            const dmgBonus = getDamageBonus(actor, mode); // bonus EN DÉS (DSD)
            const flatBonus =
              (Number(weapon.system?.damage?.base ?? 0) || 0) +
              (Number(weapon.system?.damage?.flatBonus ?? 0) || 0);

            // DSD: weapon + LetRip dice (vehicle attacks still use weapon profile)
            const dsdCount =
              (Number(weapon.system?.damage?.dsy ?? 0) || 0) +
              (Number(dmgBonus) || 0) +
              (letRip > 0 ? letRip : 0) +
              (exploit ? 2 : 0);

            await game.mcde.rollTest({
              actor,
              label: `${wName} Attack`,
              tn,
              focus,
              diceCount,
              useChroniclePoint: false, // we already paid + subtracted; keep rollTest clean
              autoSuccesses: Number(actor.system?.attributes?.[attrKey]?.auto ?? 0) || 0,
              difficulty,
              attackData: {
                kind: "vehicle-weapon",
                vehicleUuid: this.actor.uuid,
                weaponUuid: weapon.uuid,
                weaponName: wName,
                mode,
                dsdCount,
                flatBonus,
                qualities: (Array.isArray(weapon.system?.qualities) ? weapon.system.qualities : [])
                  .map(q => ({ name: String(q?.name ?? "").trim(), description: String(q?.description ?? "").trim() }))
                  .filter(q => q.name)
              }
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }, { width: 560, classes: ["mcde-dialog", "mcde-attack-dialog"] }).render(true);
  }


  async _openPilotTestDialog() {
    const SYSTEM_ID = "mutant-chronicles-diesel-edition";

    const vehicle = this.actor;
    const man = Number(vehicle.system?.combatmanoeuvrability ?? 0) || 0;

    // Resolve pilot actor
let pc = null;

// 1) If a pilot is assigned to the vehicle → use that
const pilotUuid = vehicle.system?.crew?.pilotUuid;
if (pilotUuid) {
  try {
    const pilotDoc = await fromUuid(pilotUuid);
    if (pilotDoc?.documentName === "Actor") {
      pc = pilotDoc;
    }
  } catch (e) {
    console.warn("MCDE | Invalid pilot UUID", e);
  }
}

// 2) Fallback to user character
if (!pc) {
  pc = game.user.character;
}

// 3) Still nothing → abort
if (!pc) {
  ui.notifications?.warn?.("No pilot assigned and no user character available.");
  return;
}

    const chronicleCurrent = Number(pc.system?.chronicle_points?.current ?? 0) || 0;

    const getDSP = () => Number(game.settings.get(SYSTEM_ID, "darkSymmetryPool") ?? 0) || 0;
    const setDSP = (v) => game.settings.set(SYSTEM_ID, "darkSymmetryPool", Number(v) || 0);

    const content = `
      <form class="mcde-roll-dialog" style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:14px;">Pilot Test — ${foundry.utils.escapeHTML(vehicle.name ?? "Vehicle")}</div>
          <div style="opacity:0.75; font-size:12px;">
            Manoeuvrability bonus: <strong>+${man}d20</strong>
          </div>
        </div>

        <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <span>Mode</span>
          <select name="mode">
            <option value="ta" selected>Terrestrial / Aerial</option>
            <option value="space">Space</option>
          </select>
        </label>

        <hr/>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div>
            <div style="font-weight:600;">Modifiers</div>

            <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:6px;">
              <span>Buy extra d20 (1 DSP each, max 3)</span>
              <select name="extraDice">
                <option value="0" selected>0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>

            <label style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              <input type="checkbox" name="useChronicle" ${chronicleCurrent <= 0 ? "disabled" : ""}/>
              <span>Use Chronicle Point (adds AUTO-1 die)</span>
            </label>
            <div style="opacity:0.75; font-size:12px; margin-top:2px;">
              Available: <strong>${chronicleCurrent}</strong>
            </div>
          </div>

          <div>
            <div style="font-weight:600;">Difficulty</div>
            <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:6px;">
              <span>Difficulty</span>
              <select name="difficulty">
                <option value="0">D0</option>
                <option value="1" selected>D1</option>
                <option value="2">D2</option>
                <option value="3">D3</option>
                <option value="4">D4</option>
                <option value="5">D5</option>
              </select>
            </label>
          </div>
        </div>

        <hr/>
        <div style="opacity:0.75; font-size:12px;">
          Difficulty = successes required to pass.
        </div>
      </form>
    `;

    new Dialog({
      title: "Pilot Test",
      content,
      buttons: {
        roll: {
          label: "Roll",
          callback: async (html) => {
            const mode = String(html.find("[name='mode']").val() ?? "ta");
            const extraDice = Math.max(0, Math.min(3, Number(html.find("[name='extraDice']").val()) || 0));
            const useChronicle = !!html.find("[name='useChronicle']")[0]?.checked;
            const difficulty = Number(html.find("[name='difficulty']").val());
            const diff = Number.isFinite(difficulty) ? difficulty : 1;

            const attrKey = "coordination";
            const skillKey = (mode === "space") ? "space" : "pilot";

            const attrVal = Number(pc.system?.attributes?.[attrKey]?.value ?? 0) || 0;
            const sk = pc.system?.skills?.[skillKey];
            if (!sk) {
              ui.notifications?.warn?.(`Character has no skill "${skillKey}".`);
              return;
            }
            const exp = Number(sk.expertise ?? 0) || 0;
            const foc = Number(sk.focus ?? 0) || 0;

            const tn = attrVal + exp;
            const focus = foc;

            let diceCount = 2 + extraDice + man;
            if (diceCount < 2) diceCount = 2;

            if (useChronicle) {
              const cur = Number(pc.system?.chronicle_points?.current ?? 0) || 0;
              if (cur <= 0) {
                ui.notifications?.warn?.("Not enough Chronicle Points.");
                return;
              }
              await pc.update({ "system.chronicle_points.current": cur - 1 });
            }

            if (extraDice > 0) {
              const dspNow = getDSP();
              await setDSP(dspNow + extraDice);
            }

            const label = `${pc.name} — ${mode === "space" ? "Space" : "Pilot"} + Coordination (Vehicle Manoeuvrability +${man}d20)`;

            await game.mcde.rollTest({
              actor: pc,
              label,
              tn,
              focus,
              diceCount,
              useChroniclePoint: useChronicle,
              difficulty: diff
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }, {
      width: 520,
      classes: ["mcde-dialog", "mcde-skilltest-dialog"]
    }).render(true);
  }
}