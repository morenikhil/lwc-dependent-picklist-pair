/**
 * Server-side configuration provider for the c-dependent-picklist-pair LWC.
 *
 * Reads the Dependent_Picklist_Mapping__mdt Custom Metadata Type and returns a
 * ready-to-render shape: the distinct parent options plus, for every parent
 * value, the list of child options that belong to it. The LWC does no further
 * shaping — it binds the parent options and, on selection, swaps in the child
 * list for the chosen parent.
 *
 * Custom Metadata is used deliberately: the option set is configuration, not
 * transactional data, so it is cacheable, deployable between orgs, and editable
 * by admins without a code change. Because CMDT reads are not gated by
 * object/field-level security the way sObject reads are, there is no CRUD/FLS
 * check here; the class still runs `with sharing` and funnels every failure
 * through AuraHandledException so the client never sees a raw stack trace.
 */
public with sharing class DependentPicklistController {
    /** A single combobox option (label/value pair). */
    public class Option {
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String value;

        public Option(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    /** The full config for one grouping: parents + children keyed by parent value. */
    public class PicklistConfig {
        @AuraEnabled
        public List<Option> parentOptions = new List<Option>();
        @AuraEnabled
        public Map<String, List<Option>> childOptionsByParent = new Map<String, List<Option>>();
    }

    /**
     * Returns the parent/child option configuration for a grouping.
     *
     * @param grouping The Grouping__c value that scopes the mapping rows
     *                 (e.g. 'Country_State'). Required.
     * @return A PicklistConfig with ordered parent options and child options
     *         grouped by parent value.
     */
    @AuraEnabled(cacheable=true)
    public static PicklistConfig getPicklistConfig(String grouping) {
        try {
            if (String.isBlank(grouping)) {
                throw new AuraHandledException('A grouping name is required.');
            }

            List<Dependent_Picklist_Mapping__mdt> rows = [
                SELECT
                    Parent_Value__c,
                    Parent_Label__c,
                    Child_Value__c,
                    Child_Label__c,
                    Sort_Order__c
                FROM Dependent_Picklist_Mapping__mdt
                WHERE Grouping__c = :grouping AND Active__c = true
                ORDER BY Sort_Order__c ASC NULLS LAST, Child_Label__c ASC
            ];

            PicklistConfig config = new PicklistConfig();
            // Track parent values we have already emitted so parent options stay distinct.
            Set<String> seenParents = new Set<String>();

            for (Dependent_Picklist_Mapping__mdt row : rows) {
                if (String.isBlank(row.Parent_Value__c) || String.isBlank(row.Child_Value__c)) {
                    continue;
                }

                if (!seenParents.contains(row.Parent_Value__c)) {
                    seenParents.add(row.Parent_Value__c);
                    config.parentOptions.add(
                        new Option(
                            resolveLabel(row.Parent_Label__c, row.Parent_Value__c),
                            row.Parent_Value__c
                        )
                    );
                    config.childOptionsByParent.put(row.Parent_Value__c, new List<Option>());
                }

                config.childOptionsByParent.get(row.Parent_Value__c)
                    .add(
                        new Option(
                            resolveLabel(row.Child_Label__c, row.Child_Value__c),
                            row.Child_Value__c
                        )
                    );
            }

            return config;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Unable to load picklist configuration: ' + e.getMessage());
        }
    }

    private static String resolveLabel(String label, String value) {
        return String.isBlank(label) ? value : label;
    }
}
