const CompanySector = require("../models/companySectorModel");

const CompanySectorController = {
  async getAllByCompany(req, res) {
    try {
      const sectors = await CompanySector.getAllByCompany(req.params.companyId);
      res.json(sectors);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async create(req, res) {
    try {
      const { company_id, sector } = req.body;
      if (!company_id || !sector) return res.status(400).json({ msg: "company_id et sector requis" });
      const s = await CompanySector.create({ company_id, sector });
      res.status(201).json(s);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async delete(req, res) {
    try {
      const d = await CompanySector.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Sector not found" });
      res.json({ msg: "Sector deleted" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  }
};

module.exports = CompanySectorController;