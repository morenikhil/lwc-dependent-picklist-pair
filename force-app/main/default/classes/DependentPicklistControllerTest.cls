/**
 * Tests for DependentPicklistController.
 *
 * Custom Metadata records are visible in tests without SeeAllData (API 47+),
 * so these assertions run against the deployed 'Country_State' sample rows.
 */
@isTest
private class DependentPicklistControllerTest {
    private static final String SAMPLE_GROUPING = 'Country_State';

    @isTest
    static void returnsDistinctParentsWithChildren() {
        Test.startTest();
        DependentPicklistController.PicklistConfig config =
            DependentPicklistController.getPicklistConfig(SAMPLE_GROUPING);
        Test.stopTest();

        System.assertNotEquals(null, config, 'A config should be returned.');
        System.assert(!config.parentOptions.isEmpty(), 'Sample grouping should yield parent options.');

        // Parent options must be distinct.
        Set<String> parentValues = new Set<String>();
        for (DependentPicklistController.Option opt : config.parentOptions) {
            System.assert(
                !parentValues.contains(opt.value),
                'Parent option ' + opt.value + ' should appear only once.'
            );
            parentValues.add(opt.value);
        }

        // Every parent must have a non-empty child list keyed by its value.
        for (DependentPicklistController.Option parent : config.parentOptions) {
            System.assert(
                config.childOptionsByParent.containsKey(parent.value),
                'Child map should contain an entry for parent ' + parent.value
            );
            System.assert(
                !config.childOptionsByParent.get(parent.value).isEmpty(),
                'Parent ' + parent.value + ' should have at least one child.'
            );
        }
    }

    @isTest
    static void blankGroupingThrows() {
        Test.startTest();
        try {
            DependentPicklistController.getPicklistConfig('');
            System.assert(false, 'Expected an exception for a blank grouping.');
        } catch (AuraHandledException e) {
            System.assert(true);
        }
        Test.stopTest();
    }

    @isTest
    static void unknownGroupingReturnsEmptyConfig() {
        Test.startTest();
        DependentPicklistController.PicklistConfig config =
            DependentPicklistController.getPicklistConfig('This_Grouping_Does_Not_Exist');
        Test.stopTest();

        System.assertNotEquals(null, config, 'A config object should still be returned.');
        System.assertEquals(0, config.parentOptions.size(), 'Unknown grouping should yield no parents.');
        System.assertEquals(
            0,
            config.childOptionsByParent.size(),
            'Unknown grouping should yield no child mappings.'
        );
    }

    @isTest
    static void labelFallsBackToValue() {
        // Verifies resolveLabel behaviour indirectly: every emitted option must
        // carry a non-blank label even if the metadata label field were blank.
        Test.startTest();
        DependentPicklistController.PicklistConfig config =
            DependentPicklistController.getPicklistConfig(SAMPLE_GROUPING);
        Test.stopTest();

        for (DependentPicklistController.Option opt : config.parentOptions) {
            System.assert(String.isNotBlank(opt.label), 'Parent label should never be blank.');
            System.assert(String.isNotBlank(opt.value), 'Parent value should never be blank.');
        }
    }
}
