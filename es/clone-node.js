import { clonePseudoElements } from './clone-pseudos';
import { createImage, toArray, isInstanceOfElement } from './util';
import { getMimeType } from './mimes';
import { resourceToDataURL } from './dataurl';
async function cloneCanvasElement(canvas) {
    const dataURL = canvas.toDataURL();
    if (dataURL === 'data:,') {
        return canvas.cloneNode(false);
    }
    if (canvas.getContext('2d')) {
        return createImage(dataURL);
    }
    const out = document
        .createElement('canvas')
        .getContext('2d', { alpha: true });
    out.canvas.width = canvas.width;
    out.canvas.height = canvas.height;
    const data = out.getImageData(0, 0, out.canvas.width, out.canvas.height);
    const webglDataURL = await new Promise((resolve) => {
        try {
            requestAnimationFrame(() => {
                const gl = document.createElement('canvas').getContext('webgl');
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
                const fb = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.data.buffer));
                out.putImageData(data, 0, 0);
                // clean up memory
                gl.deleteTexture(tex);
                gl.deleteFramebuffer(fb);
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) {
                    ext.loseContext();
                }
                resolve(out.canvas.toDataURL());
            });
        }
        catch (err) {
            resolve(dataURL);
        }
    });
    return createImage(webglDataURL);
}
async function cloneVideoElement(video, options) {
    if (video.currentSrc) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx === null || ctx === void 0 ? void 0 : ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL();
        return createImage(dataURL);
    }
    const poster = video.poster;
    const contentType = getMimeType(poster);
    const dataURL = await resourceToDataURL(poster, contentType, options);
    return createImage(dataURL);
}
async function cloneIFrameElement(iframe) {
    var _a;
    try {
        if ((_a = iframe === null || iframe === void 0 ? void 0 : iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.body) {
            return (await cloneNode(iframe.contentDocument.body, {}, true));
        }
    }
    catch (_b) {
        // Failed to clone iframe
    }
    return iframe.cloneNode(false);
}
async function cloneSingleNode(node, options) {
    if (isInstanceOfElement(node, HTMLCanvasElement)) {
        return cloneCanvasElement(node);
    }
    if (isInstanceOfElement(node, HTMLVideoElement)) {
        return cloneVideoElement(node, options);
    }
    if (isInstanceOfElement(node, HTMLIFrameElement)) {
        return cloneIFrameElement(node);
    }
    return node.cloneNode(false);
}
const isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === 'SLOT';
async function cloneChildren(nativeNode, clonedNode, options) {
    var _a, _b;
    let children = [];
    if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
        children = toArray(nativeNode.assignedNodes());
    }
    else if (isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
        ((_a = nativeNode.contentDocument) === null || _a === void 0 ? void 0 : _a.body)) {
        children = toArray(nativeNode.contentDocument.body.childNodes);
    }
    else {
        children = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes);
    }
    if (children.length === 0 ||
        isInstanceOfElement(nativeNode, HTMLVideoElement)) {
        return clonedNode;
    }
    await children.reduce((deferred, child) => deferred
        .then(() => cloneNode(child, options))
        .then((clonedChild) => {
        if (clonedChild) {
            clonedNode.appendChild(clonedChild);
        }
    }), Promise.resolve());
    return clonedNode;
}
function cloneCSSStyle(nativeNode, clonedNode) {
    const targetStyle = clonedNode.style;
    if (!targetStyle) {
        return;
    }
    const sourceStyle = window.getComputedStyle(nativeNode);
    if (sourceStyle.cssText) {
        targetStyle.cssText = sourceStyle.cssText;
        targetStyle.transformOrigin = sourceStyle.transformOrigin;
    }
    else {
        toArray(sourceStyle).forEach((name) => {
            let value = sourceStyle.getPropertyValue(name);
            if (name === 'font-size' && value.endsWith('px')) {
                const reducedFont = Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1;
                value = `${reducedFont}px`;
            }
            if (isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
                name === 'display' &&
                value === 'inline') {
                value = 'block';
            }
            if (name === 'd' && clonedNode.getAttribute('d')) {
                value = `path(${clonedNode.getAttribute('d')})`;
            }
            targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
        });
    }
}
function cloneInputValue(nativeNode, clonedNode) {
    if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
        clonedNode.innerHTML = nativeNode.value;
    }
    if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
        clonedNode.setAttribute('value', nativeNode.value);
    }
}
function cloneSelectValue(nativeNode, clonedNode) {
    if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
        const clonedSelect = clonedNode;
        const selectedOption = Array.from(clonedSelect.children).find((child) => nativeNode.value === child.getAttribute('value'));
        if (selectedOption) {
            selectedOption.setAttribute('selected', '');
        }
    }
}
function decorate(nativeNode, clonedNode) {
    if (isInstanceOfElement(clonedNode, Element)) {
        cloneCSSStyle(nativeNode, clonedNode);
        clonePseudoElements(nativeNode, clonedNode);
        cloneInputValue(nativeNode, clonedNode);
        cloneSelectValue(nativeNode, clonedNode);
    }
    return clonedNode;
}
async function ensureSVGSymbols(clone, options) {
    const uses = clone.querySelectorAll ? clone.querySelectorAll('use') : [];
    if (uses.length === 0) {
        return clone;
    }
    const processedDefs = {};
    for (let i = 0; i < uses.length; i++) {
        const use = uses[i];
        const id = use.getAttribute('xlink:href');
        if (id) {
            const exist = clone.querySelector(id);
            const definition = document.querySelector(id);
            if (!exist && definition && !processedDefs[id]) {
                // eslint-disable-next-line no-await-in-loop
                processedDefs[id] = (await cloneNode(definition, options, true));
            }
        }
    }
    const nodes = Object.values(processedDefs);
    if (nodes.length) {
        const ns = 'http://www.w3.org/1999/xhtml';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('xmlns', ns);
        svg.style.position = 'absolute';
        svg.style.width = '0';
        svg.style.height = '0';
        svg.style.overflow = 'hidden';
        svg.style.display = 'none';
        const defs = document.createElementNS(ns, 'defs');
        svg.appendChild(defs);
        for (let i = 0; i < nodes.length; i++) {
            defs.appendChild(nodes[i]);
        }
        clone.appendChild(svg);
    }
    return clone;
}
export async function cloneNode(node, options, isRoot) {
    if (!isRoot && options.filter && !options.filter(node)) {
        return null;
    }
    return Promise.resolve(node)
        .then((clonedNode) => cloneSingleNode(clonedNode, options))
        .then((clonedNode) => cloneChildren(node, clonedNode, options))
        .then((clonedNode) => decorate(node, clonedNode))
        .then((clonedNode) => ensureSVGSymbols(clonedNode, options));
}
//# sourceMappingURL=clone-node.js.map