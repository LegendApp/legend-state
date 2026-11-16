import { internal } from '@legendapp/state';

const { safeParse, safeStringify } = internal;

export const MetadataSuffix = '__m';
const FormatKey = '__LSFormat';
/** Format 1: safeStringify tags Dates, so ISO date strings load as strings */
const Format = 1;
const FormatMarker = new RegExp(`"${FormatKey}":${Format}[,}]`);

/**
 * JSON format versioning for key-value persist plugins. The format version is stored in each table's metadata.
 * Unversioned (legacy) tables load with ISO date string revival and are rewritten in the current format on the
 * next save of the table or its metadata.
 */
export class PersistJSONFormat {
    private versioned = new Set<string>();

    /** The data table that a stored key belongs to */
    table(key: string) {
        return key.endsWith(MetadataSuffix) ? key.slice(0, -MetadataSuffix.length) : key;
    }
    /** Parse a stored key. getRawMetadata reads the table's stored metadata when parsing table data. */
    parse(key: string, raw: string, getRawMetadata: () => string | null | undefined) {
        const table = this.table(key);
        let legacy = false;
        if (!this.versioned.has(table)) {
            const rawMetadata = key === table ? getRawMetadata() : raw;
            if (rawMetadata && FormatMarker.test(rawMetadata)) {
                this.versioned.add(table);
            } else {
                legacy = true;
            }
        }
        const value = safeParse(raw, legacy);
        if (key !== table && value) delete value[FormatKey];
        return value;
    }
    /** Whether saving this key must rewrite both the table and its metadata in the current format */
    needsUpgrade(key: string) {
        return !this.versioned.has(this.table(key));
    }
    /** Stringify a value to save, marking metadata with the format version */
    stringify(key: string, value: any) {
        const table = this.table(key);
        if (key !== table) {
            this.versioned.add(table);
            value = { ...value, [FormatKey]: Format };
        }
        return safeStringify(value);
    }
    /** Forget the version when metadata is deleted, so the next save writes it again */
    delete(key: string) {
        if (key.endsWith(MetadataSuffix)) this.versioned.delete(this.table(key));
    }
}
