export class MCDEVehicleSheet extends ActorSheet {
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
    context.system = this.actor.system ?? {};
    context.locations = context.system.locations ?? {};
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.on("click", ".mcde-box", async (ev) => {
      ev.preventDefault();

      const el = ev.currentTarget;
      const locKey = el.dataset.loc;
      const track = el.dataset.track; // "surfaceCur" | "systemCur" | "structuralCur"
      const idx = Number(el.dataset.idx ?? 0) || 0;

      // Shift+click = reset
      const next = ev.shiftKey ? 0 : idx;

      await this.actor.update({ [`system.locations.${locKey}.${track}`]: next });
    });
  }
}