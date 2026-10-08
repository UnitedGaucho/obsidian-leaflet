import { App, Events, Notice } from "obsidian";

import { parseLink } from "../utils";
import { ImageLayerData } from "../../types";
import t from "src/l10n/locale";
import { validateTileManifest } from "../map/local-tiles";

export default class Loader extends Events {
    constructor(public app: App) {
        super();
    }
    async loadImage(id: string, layers: string[]): Promise<void> {
        for (let image of layers) {
            const layer = await this.loadLayer(image);
            this.trigger(`${id}-layer-data-ready`, layer);
        }
    }

    async loadImageAsync(
        id: string,
        layers: string[]
    ): Promise<ImageLayerData> {
        if (!layers.length) throw new Error("No image layer supplied.");
        return this.loadLayer(layers[0]);
    }
    async loadLayer(image: string): Promise<ImageLayerData> {
        const [path, alias] = parseLink(decodeURIComponent(image)).split("|");
        if (path.toLowerCase().endsWith(".leaflet.json")) {
            const file = this.app.metadataCache.getFirstLinkpathDest(path, "");
            const manifestPath = file?.path ?? path;
            const manifest = validateTileManifest(JSON.parse(await this.app.vault.adapter.read(manifestPath)));
            const parent = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1) : "";
            return {
                data: manifestPath, h: manifest.height, w: manifest.width,
                alias: alias || null, id: encodeURIComponent(decodeURIComponent(image)),
                tiles: {
                    manifest,
                    urlForTile: (z, x, y) => this.app.vault.adapter.getResourcePath(
                        parent + manifest.tilePattern.replace(/\{z\}/g, String(z))
                            .replace(/\{x\}/g, String(x)).replace(/\{y\}/g, String(y))
                    )
                }
            };
        }
        const { link, id, alias: imageAlias } = await this.getLink(image);
        const { h, w } = await this.getImageDimensions(link);
        return { data: link, h, w, alias: imageAlias, id };
    }
    unload() {}
    getImageDimensions(url: string): Promise<{ h: number; w: number }> {
        return new Promise(function (resolved, reject) {
            var i = new Image();
            i.onload = function () {
                const { width, height } = i;
                i.detach();
                resolved({ w: width, h: height });
            };
            i.onerror = () => {
                new Notice(
                    t("There was an issue getting the image dimensions.")
                );
                reject();
            };

            i.src = url;
        });
    }
    async getLink(url: string) {
        url = decodeURIComponent(url);
        let type: "link" | "file";
        let link: string, alias: string;
        try {
            if (/https?:/.test(url)) {
                //url
                type = "link";
                const [linkpath, aliaspath] = parseLink(url).split("|");
                link = linkpath;
                alias = aliaspath;
            } else {
                type = "file";
                const [linkpath, aliaspath] = parseLink(url).split("|");
                alias = aliaspath && aliaspath.length ? aliaspath : null;
                let file = this.app.metadataCache.getFirstLinkpathDest(
                    linkpath,
                    ""
                );
                if (!file) throw new Error();
                link = this.app.vault.getResourcePath(file);
            }
        } catch (e) {
            console.error(e);
        }
        return { link, id: encodeURIComponent(url), alias };
    }
}
