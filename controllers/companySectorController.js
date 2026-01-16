const CompanySector = require("../models/companySectorModel");

// GET /company-profiles/:companyId/sectors
async function listCompanySectors(req, res) {
  try {
    const companyId = parseInt(req.params.companyId, 10);
    if (!Number.isInteger(companyId)) {
      return res.status(400).json({ msg: "companyId invalide" });
    }

    const sectors = await CompanySector.getAllByCompany(companyId, { joinLabels: true });
    res.json(sectors);
  } catch (err) {
    console.error("listCompanySectors error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// POST /company-profiles/:companyId/sectors  body: { sector_id }
async function addCompanySector(req, res) {
  try {
    const companyId = parseInt(req.params.companyId, 10);
    if (!Number.isInteger(companyId)) {
      return res.status(400).json({ msg: "companyId invalide" });
    }

    const { sector_id } = req.body || {};
    if (!sector_id) {
      return res.status(400).json({ msg: "sector_id requis" });
    }

    const row = await CompanySector.create({ company_id: companyId, sector_id });
    res.status(201).json(row);
  } catch (err) {
    console.error("addCompanySector error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// DELETE /company-profiles/:companyId/sectors/:sectorId
async function removeCompanySector(req, res) {
  try {
    const companyId = parseInt(req.params.companyId, 10);
    const sectorId = parseInt(req.params.sectorId, 10);

    if (!Number.isInteger(companyId) || !Number.isInteger(sectorId)) {
      return res.status(400).json({ msg: "companyId/sectorId invalides" });
    }

    const d = await CompanySector.deleteByCompanyAndSector(companyId, sectorId);
    if (!d) return res.status(404).json({ msg: "Lien introuvable" });

    res.json({ msg: "Sector removed" });
  } catch (err) {
    console.error("removeCompanySector error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = {
  listCompanySectors,
  addCompanySector,
  removeCompanySector,
};
