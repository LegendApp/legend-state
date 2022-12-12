export {
    configureObservablePersistence,
    observablePersistConfiguration,
} from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { getDateModifiedKey } from './src/persist/persistHelpers';
export { mapPersistences, persistObservable, persistState } from './src/persist/persistObservable';

import { tracking } from './src/tracking';

export function isInRemoteChange() {
    return tracking.inRemoteChange;
}
