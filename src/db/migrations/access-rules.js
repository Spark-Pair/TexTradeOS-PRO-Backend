import { db } from "../connection.js";
import { defaultAccessRules, defaultReferenceData } from "../../config/business-defaults.js";
import { parseJson } from "../mappers.js";

export const backfillBusinessAccessRules = () => {
  const defaults = defaultAccessRules();
  const defaultByKey = new Map(defaults.map((rule) => [rule.key, rule]));
  const businesses = db.prepare("SELECT id, reference_data, rule_data FROM businesses").all();
  const update = db.prepare("UPDATE businesses SET reference_data = ?, rule_data = ?, updated_at = ? WHERE id = ?");

  db.transaction(() => {
    businesses.forEach((business) => {
      const referenceData = parseJson(business.reference_data, {});
      const storedRuleData = parseJson(business.rule_data, {});
      const storedRules = Array.isArray(storedRuleData.access_rules) ? storedRuleData.access_rules : [];
      const storedByKey = new Map(storedRules.filter((rule) => rule?.key).map((rule) => [rule.key, rule]));
      const accessRules = defaults.map((defaultRule) => {
        const stored = storedByKey.get(defaultRule.key);
        if (!stored) return { ...defaultRule };
        return {
          ...defaultRule, ...stored, key: defaultRule.key,
          label: stored.label || defaultRule.label,
          roles: Array.isArray(stored.roles) ? stored.roles.filter(Boolean) : defaultRule.roles,
          show_in_sidebar: typeof stored.show_in_sidebar === "boolean" ? stored.show_in_sidebar : defaultRule.show_in_sidebar,
        };
      });
      storedRules.forEach((rule) => {
        if (rule?.key && !defaultByKey.has(rule.key)) accessRules.push(rule);
      });
      const rolesFromUsers = db.prepare("SELECT DISTINCT role FROM users WHERE business_id = ? AND role IS NOT NULL AND TRIM(role) <> ''")
        .all(business.id).map((row) => row.role);
      const rolesFromRules = accessRules.flatMap((rule) => Array.isArray(rule.roles) ? rule.roles : []);
      const configuredRoles = Array.isArray(referenceData.user_roles) ? referenceData.user_roles : [];
      const userRoles = [...new Set([...configuredRoles, ...rolesFromUsers, ...rolesFromRules]
        .map((role) => String(role || "").trim()).filter((role) => role && role !== "developer"))];
      const nextReferenceData = { ...defaultReferenceData(), ...referenceData, user_roles: userRoles.length ? userRoles : defaultReferenceData().user_roles };
      const nextRuleData = { ...storedRuleData, access_rules: accessRules };
      if (JSON.stringify(nextReferenceData) !== JSON.stringify(referenceData) || JSON.stringify(nextRuleData) !== JSON.stringify(storedRuleData)) {
        update.run(JSON.stringify(nextReferenceData), JSON.stringify(nextRuleData), new Date().toISOString(), business.id);
      }
    });
  }).immediate();
};
