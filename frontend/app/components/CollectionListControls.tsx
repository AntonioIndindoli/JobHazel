"use client";

import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";

export type CollectionSortOption = { value: string; label: string };

export function CollectionListControls({ noun, search, filters, activeFilters, filtersOpen, onToggleFilters, activeFilterCount, hasActiveFilters, onReset, sortValue, sortOptions, onSortChange }: {
    noun: string;
    search: ReactNode;
    filters: ReactNode;
    activeFilters?: ReactNode;
    filtersOpen: boolean;
    onToggleFilters: () => void;
    activeFilterCount: number;
    hasActiveFilters: boolean;
    onReset: () => void;
    sortValue: string;
    sortOptions: CollectionSortOption[];
    onSortChange: (value: string) => void;
}) {
    return <div className="collection-controls">
        <div className="collection-controls-row" role="group" aria-label={`${noun} search, filters, and sorting`}>
            {search}
            <button type="button" className="collection-filters-button" aria-expanded={filtersOpen} aria-controls={`collection-filters-${noun}`} onClick={onToggleFilters}>
                <AppIcon name="filter" size={18} />
                <span>Filters</span>
                {activeFilterCount > 0 && <span className="collection-filter-count" aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span>}
            </button>
            <label className="collection-sort-field">
                <span>Sort:</span>
                <select aria-label={`Sort ${noun}`} value={sortValue} onChange={event => onSortChange(event.target.value)}>
                    {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </label>
        </div>
        {filtersOpen && <div className="collection-filters-panel" id={`collection-filters-${noun}`} aria-label={`${noun} filters`}>
            <div className="collection-filters-heading">
                <strong>Filter {noun}</strong>
                {hasActiveFilters && <button type="button" className="collection-filter-reset" onClick={onReset}><AppIcon name="history" size={15} />Reset filters</button>}
            </div>
            <div className="collection-filter-fields">{filters}</div>
            {activeFilterCount > 0 && activeFilters && <div className="collection-applied-filters">{activeFilters}</div>}
        </div>}
        {!filtersOpen && activeFilterCount > 0 && activeFilters && <div className="collection-applied-filters is-collapsed">{activeFilters}<button type="button" className="collection-filter-reset" onClick={onReset}>Reset filters</button></div>}
    </div>;
}
