export {
    configureObservablePersistence,
    observablePersistConfiguration,
} from './src/persist/configureObservablePersistence';
export { invertFieldMap, transformObject, transformPath } from './src/persist/fieldTransformer';
export { mapPersistences, onChangeRemote, persistObservable, persistState } from './src/persist/persistObservable';
import { tracking } from '@legendapp/state';

export function isInRemoteChange() {
    return tracking.inRemoteChange;
}
