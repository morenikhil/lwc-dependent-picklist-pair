import { LightningElement } from 'lwc';

/**
 * dependentPicklistPairDemo
 * -----------------------------------------------------------------------------
 * Example consumer of c-dependent-picklist-pair. Demonstrates both data sources
 * side by side:
 *   - Country -> State, driven by Custom Metadata (grouping="Country_State")
 *   - Category -> Subcategory, driven by an inline JS map
 *
 * Delete this bundle once you have your own consumer.
 */
export default class DependentPicklistPairDemo extends LightningElement {
    // Metadata-driven selection (Country -> State).
    countrySelection = { parentValue: undefined, childValue: undefined };

    // Map-driven selection (Category -> Subcategory).
    productSelection = { parentValue: undefined, childValue: undefined };

    // A plain JS map: parent value -> array of child values (labels default to values).
    productMap = {
        Hardware: ['Laptop', 'Monitor', 'Keyboard'],
        Software: ['CRM', 'ERP', 'Analytics'],
        Services: ['Consulting', 'Support', 'Training']
    };

    handleCountryChange(event) {
        this.countrySelection = { ...event.detail };
    }

    handleProductChange(event) {
        this.productSelection = { ...event.detail };
    }

    get countrySummary() {
        return this._summarize(this.countrySelection);
    }

    get productSummary() {
        return this._summarize(this.productSelection);
    }

    handleValidate() {
        const pairs = [...this.template.querySelectorAll('c-dependent-picklist-pair')];
        const allValid = pairs.reduce((valid, p) => p.reportValidity() && valid, true);
        this._toast(allValid ? 'All selections are valid.' : 'Please complete the required fields.');
    }

    handleReset() {
        this.template.querySelectorAll('c-dependent-picklist-pair').forEach((p) => p.reset());
        this.countrySelection = { parentValue: undefined, childValue: undefined };
        this.productSelection = { parentValue: undefined, childValue: undefined };
    }

    _summarize(selection) {
        if (!selection || !selection.parentValue) {
            return 'Nothing selected yet.';
        }
        const child = selection.childValue || '(no child selected)';
        return `${selection.parentValue} → ${child}`;
    }

    _toast(message) {
        // Notify any host page; a real consumer would raise a ShowToastEvent here.
        this.dispatchEvent(new CustomEvent('demomessage', { detail: message }));
    }
}
