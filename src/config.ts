export const config = {
    enableDirectAccess: true,
};

export function configureLegendState({ enableDirectAccess }: { enableDirectAccess?: boolean }) {
    if (enableDirectAccess === false) {
        config.enableDirectAccess = false;
    }
}
