import type { configureReactive } from '../react/configureReactive';
import { enableReactComponents } from './enableReactComponents';

export function enableReactive(config: typeof configureReactive) {
    enableReactComponents(config);
}
