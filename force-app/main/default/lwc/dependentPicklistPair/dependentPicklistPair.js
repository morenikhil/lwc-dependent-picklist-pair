import { LightningElement, api, track } from 'lwc';
import getPicklistConfig from '@salesforce/apex/DependentPicklistController.getPicklistConfig';

/**
 * dependentPicklistPair
 * -----------------------------------------------------------------------------
 * A reusable parent/child picklist pair. Selecting a value in the parent
 * combobox filters the options available in the child combobox.
 *
 * The option set can come from either of two sources — the component is
 * agnostic to which:
 *
 *   1. Custom Metadata  — set `grouping` to a Dependent_Picklist_Mapping__mdt
 *      Grouping__c value. The component fetches the config from Apex (cacheable).
 *
 *          <c-dependent-picklist-pair grouping="Country_State"
 *                                     parent-label="Country" child-label="State">
 *          </c-dependent-picklist-pair>
 *
 *   2. JS map  — pass a `mapping` object directly (no server round-trip). Two
 *      shapes are accepted:
 *
 *          // simple: parent value -> array of child values (labels = values)
 *          { Hardware: ['Laptop', 'Monitor'], Software: ['CRM', 'ERP'] }
 *
 *          // rich: explicit labels for parents and children
 *          {
 *            parents:  [{ label: 'Hardware', value: 'HW' }],
 *            children: { HW: [{ label: 'Laptop', value: 'LAPTOP' }] }
 *          }
 *
 * `mapping` takes precedence over `grouping`, so a consumer never triggers a
 * server call while supplying its own map.
 *
 * Contract:
 *   Attributes : grouping, mapping, parentLabel, childLabel, parentPlaceholder,
 *                childPlaceholder, required, disabled, parentValue, childValue, value
 *   Methods    : checkValidity(), reportValidity(), reset(), focus()
 *   Events     : change  ->  detail { parentValue, childValue }
 */
export default class DependentPicklistPair extends LightningElement {
    // ---- Public configuration -------------------------------------------------

    @api parentLabel = 'Parent';
    @api childLabel = 'Child';
    @api parentPlaceholder = 'Select an option';
    @api childPlaceholder = 'Select an option';

    /** Marks both comboboxes as required for validation. */
    @api required = false;

    /** Disables both comboboxes. */
    @api disabled = false;

    // ---- Internal state -------------------------------------------------------

    @track _parentOptions = [];
    _childrenByParent = {};
    _parentValue;
    _childValue;
    _grouping;
    _mapping;
    _connected = false;
    _loading = false;
    _error;

    // ---- Data-source inputs ---------------------------------------------------

    /** Custom Metadata grouping name (Dependent_Picklist_Mapping__mdt.Grouping__c). */
    @api
    get grouping() {
        return this._grouping;
    }
    set grouping(value) {
        this._grouping = value;
        if (this._connected) {
            this._refresh();
        }
    }

    /** JS map data source. Overrides `grouping` when provided. */
    @api
    get mapping() {
        return this._mapping;
    }
    set mapping(value) {
        this._mapping = value;
        if (this._connected) {
            this._refresh();
        }
    }

    // ---- Public value API -----------------------------------------------------

    /** The currently selected parent value. */
    @api
    get parentValue() {
        return this._parentValue;
    }
    set parentValue(value) {
        this._parentValue = value;
        // Clear a child selection that is not valid under the new parent.
        if (!this._childValueIsValid()) {
            this._childValue = undefined;
        }
    }

    /** The currently selected child value. */
    @api
    get childValue() {
        return this._childValue;
    }
    set childValue(value) {
        this._childValue = value;
    }

    /** Convenience getter/setter for both values as one object. */
    @api
    get value() {
        return { parentValue: this._parentValue, childValue: this._childValue };
    }
    set value(val) {
        if (val && typeof val === 'object') {
            this.parentValue = val.parentValue;
            this.childValue = val.childValue;
        }
    }

    // ---- Lifecycle ------------------------------------------------------------

    connectedCallback() {
        this._connected = true;
        this._refresh();
    }

    // ---- Derived state (template) ---------------------------------------------

    get parentOptions() {
        return this._parentOptions;
    }

    get childOptions() {
        return this._childrenByParent[this._parentValue] || [];
    }

    get isChildDisabled() {
        return this.disabled || !this._parentValue || this.childOptions.length === 0;
    }

    get isChildRequired() {
        return this.required && !this.isChildDisabled;
    }

    get computedChildPlaceholder() {
        if (!this._parentValue) {
            return `Select ${this.parentLabel.toLowerCase()} first`;
        }
        return this.childPlaceholder;
    }

    get showError() {
        return !!this._error;
    }

    get errorMessage() {
        return this._error;
    }

    get isLoading() {
        return this._loading;
    }

    // ---- Event handlers -------------------------------------------------------

    handleParentChange(event) {
        this._parentValue = event.detail.value;
        // A child value carried over from the previous parent is no longer valid.
        if (!this._childValueIsValid()) {
            this._childValue = undefined;
        }
        this._fireChange();
    }

    handleChildChange(event) {
        this._childValue = event.detail.value;
        this._fireChange();
    }

    // ---- Public imperative API ------------------------------------------------

    /** Returns true if both comboboxes satisfy their constraints (no UI change). */
    @api
    checkValidity() {
        return this._comboboxes().every((c) => c.checkValidity());
    }

    /** Reports validity on both comboboxes (shows messages) and returns the result. */
    @api
    reportValidity() {
        // Reduce (not every) so both fields render their errors in one pass.
        return this._comboboxes().reduce((valid, c) => c.reportValidity() && valid, true);
    }

    /** Clears both selections. */
    @api
    reset() {
        this._parentValue = undefined;
        this._childValue = undefined;
    }

    /** Moves focus to the parent combobox. */
    @api
    focus() {
        const parent = this.template.querySelector('lightning-combobox[data-role="parent"]');
        if (parent) {
            parent.focus();
        }
    }

    // ---- Internals ------------------------------------------------------------

    _refresh() {
        this._error = undefined;

        // Map mode: no server call needed.
        if (this._mapping) {
            this._applyConfig(this._normalizeMap(this._mapping));
            this._loading = false;
            return;
        }

        // Metadata mode: fetch from Apex (cacheable).
        if (this._grouping) {
            this._loading = true;
            getPicklistConfig({ grouping: this._grouping })
                .then((data) => {
                    this._applyConfig(data);
                    this._error = undefined;
                })
                .catch((error) => {
                    this._error = this._reduceError(error);
                    this._parentOptions = [];
                    this._childrenByParent = {};
                })
                .finally(() => {
                    this._loading = false;
                });
            return;
        }

        // Neither source configured.
        this._parentOptions = [];
        this._childrenByParent = {};
    }

    /** Accepts the Apex/normalized shape { parentOptions, childOptionsByParent }. */
    _applyConfig(config) {
        const parentOptions = (config && config.parentOptions) || [];
        this._parentOptions = parentOptions.map((o) => ({ label: o.label, value: o.value }));
        this._childrenByParent = (config && config.childOptionsByParent) || {};

        // If a preset child value is no longer valid under the loaded options, clear it.
        if (this._parentValue && !this._childValueIsValid()) {
            this._childValue = undefined;
        }
    }

    /** Normalizes a JS map (simple or rich) into { parentOptions, childOptionsByParent }. */
    _normalizeMap(map) {
        const config = { parentOptions: [], childOptionsByParent: {} };
        if (!map || typeof map !== 'object') {
            return config;
        }

        // Rich shape: has an explicit `children` object.
        if (map.children && typeof map.children === 'object') {
            const children = map.children;
            const parents = Array.isArray(map.parents)
                ? map.parents.map((p) => this._toOption(p))
                : Object.keys(children).map((k) => ({ label: k, value: k }));
            config.parentOptions = parents;
            Object.keys(children).forEach((key) => {
                config.childOptionsByParent[key] = (children[key] || []).map((c) => this._toOption(c));
            });
            return config;
        }

        // Simple shape: keys are parent values, values are child arrays.
        Object.keys(map).forEach((key) => {
            config.parentOptions.push({ label: key, value: key });
            config.childOptionsByParent[key] = (map[key] || []).map((c) => this._toOption(c));
        });
        return config;
    }

    /** Coerces a string or {label,value} into a normalized {label,value} option. */
    _toOption(item) {
        if (item && typeof item === 'object') {
            const value = item.value;
            return { label: item.label != null ? item.label : value, value };
        }
        return { label: item, value: item };
    }

    _childValueIsValid() {
        return this.childOptions.some((o) => o.value === this._childValue);
    }

    _comboboxes() {
        return [...this.template.querySelectorAll('lightning-combobox')];
    }

    _fireChange() {
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: {
                    parentValue: this._parentValue,
                    childValue: this._childValue
                }
            })
        );
    }

    _reduceError(error) {
        if (Array.isArray(error && error.body)) {
            return error.body.map((e) => e.message).join(', ');
        }
        if (error && error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        if (error && typeof error.message === 'string') {
            return error.message;
        }
        return 'Unknown error loading picklist options.';
    }
}
