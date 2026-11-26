import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.argv[2];
if (!cli) {
    console.error('Usage: node ios/scripts/build-icons.mjs /path/to/draw-icons/scripts/icons.js');
    process.exit(1);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const iconDirectory = join(root, 'ios/icons');
const assetCatalog = join(root, 'ios/SlipSurge/Assets.xcassets');

execFileSync(process.execPath, [cli, 'build'], { cwd: root, stdio: 'inherit' });

for (const file of readdirSync(iconDirectory).filter(name => name.endsWith('.svg'))) {
    const imageset = join(assetCatalog, `ss-icon-${file.slice(0, -4)}.imageset`);
    mkdirSync(imageset, { recursive: true });
    const svg = readFileSync(join(iconDirectory, file), 'utf8');
    // The asset catalog applies the foreground style to the vector's alpha mask.
    writeFileSync(join(imageset, file), svg.replaceAll('currentColor', '#000'));
    const contents = {
        images: [{ filename: file, idiom: 'universal' }],
        info: { author: 'xcode', version: 1 },
        properties: {
            'preserves-vector-representation': true,
            'template-rendering-intent': 'template',
        },
    };
    writeFileSync(join(imageset, 'Contents.json'), JSON.stringify(contents, null, 2) + '\n');
}
