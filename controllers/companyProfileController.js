const CompanyProfile = require("../models/companyProfileModel");

const CompanyProfileController = {
  async getAll(req, res) {
    try {
      const companies = await CompanyProfile.getAll();
      res.json(companies);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getById(req, res) {
    try {
      const company = await CompanyProfile.getById(req.params.id);
      if (!company) return res.status(404).json({ msg: "Company not found" });
      res.json(company);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async create(req, res) {
    try {
      const { user_id, name, description, sector_main, location, website, phone, email } = req.body;
      if (!user_id || !name) return res.status(400).json({ msg: "user_id et name requis" });
      const company = await CompanyProfile.create({ user_id, name, description, sector_main, location, website, phone, email });
      res.status(201).json(company);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async update(req, res) {
    try {
      const updated = await CompanyProfile.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ msg: "Company not found or no fields provided" });
      res.json(updated);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async delete(req, res) {
    try {
      const d = await CompanyProfile.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Company not found" });
      res.json({ msg: "Company deleted" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  }
};

module.exports = CompanyProfileController;



