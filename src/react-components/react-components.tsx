import { BindKeys, reactive, ShapeWith$ } from '@legendapp/state/react';
import { FC } from 'react';

type FCReactive<P> = FC<P & ShapeWith$<P>>;

const bindables = new Set(['input', 'textarea', 'select']);

const bindInfo: BindKeys = { value: { handler: 'onChange', getValue: (e) => e.target.value } };
const bindInfoInput: BindKeys = Object.assign(
    { checked: { handler: 'onChange', getValue: (e) => e.target.checked } },
    bindInfo
);

export const legend = new Proxy(
    {},
    {
        get(target, p: string) {
            if (!target[p]) {
                target[p] = reactive(p, bindables.has(p) && (p === 'input' ? bindInfoInput : bindInfo));
            }
            return target[p];
        },
    }
) as {
    a: FCReactive<React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>>;
    abbr: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    address: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    area: FCReactive<React.DetailedHTMLProps<React.AreaHTMLAttributes<HTMLAreaElement>, HTMLAreaElement>>;
    article: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    aside: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    audio: FCReactive<React.DetailedHTMLProps<React.AudioHTMLAttributes<HTMLAudioElement>, HTMLAudioElement>>;
    b: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    base: FCReactive<React.DetailedHTMLProps<React.BaseHTMLAttributes<HTMLBaseElement>, HTMLBaseElement>>;
    bdi: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    bdo: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    big: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    blockquote: FCReactive<React.DetailedHTMLProps<React.BlockquoteHTMLAttributes<HTMLQuoteElement>, HTMLQuoteElement>>;
    body: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLBodyElement>, HTMLBodyElement>>;
    br: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLBRElement>, HTMLBRElement>>;
    button: FCReactive<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>>;
    canvas: FCReactive<React.DetailedHTMLProps<React.CanvasHTMLAttributes<HTMLCanvasElement>, HTMLCanvasElement>>;
    caption: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    cite: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    code: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    col: FCReactive<React.DetailedHTMLProps<React.ColHTMLAttributes<HTMLTableColElement>, HTMLTableColElement>>;
    colgroup: FCReactive<
        React.DetailedHTMLProps<React.ColgroupHTMLAttributes<HTMLTableColElement>, HTMLTableColElement>
    >;
    data: FCReactive<React.DetailedHTMLProps<React.DataHTMLAttributes<HTMLDataElement>, HTMLDataElement>>;
    datalist: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDataListElement>, HTMLDataListElement>>;
    dd: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    del: FCReactive<React.DetailedHTMLProps<React.DelHTMLAttributes<HTMLModElement>, HTMLModElement>>;
    details: FCReactive<React.DetailedHTMLProps<React.DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement>>;
    dfn: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    dialog: FCReactive<React.DetailedHTMLProps<React.DialogHTMLAttributes<HTMLDialogElement>, HTMLDialogElement>>;
    div: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>>;
    dl: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDListElement>, HTMLDListElement>>;
    dt: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    em: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    embed: FCReactive<React.DetailedHTMLProps<React.EmbedHTMLAttributes<HTMLEmbedElement>, HTMLEmbedElement>>;
    fieldset: FCReactive<
        React.DetailedHTMLProps<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, HTMLFieldSetElement>
    >;
    figcaption: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    figure: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    footer: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    form: FCReactive<React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>>;
    h1: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    h2: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    h3: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    h4: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    h5: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    h6: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>>;
    head: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>>;
    header: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    hgroup: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    hr: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLHRElement>, HTMLHRElement>>;
    html: FCReactive<React.DetailedHTMLProps<React.HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>>;
    i: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    iframe: FCReactive<React.DetailedHTMLProps<React.IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement>>;
    img: FCReactive<React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>>;
    input: FCReactive<React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>>;
    ins: FCReactive<React.DetailedHTMLProps<React.InsHTMLAttributes<HTMLModElement>, HTMLModElement>>;
    kbd: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    keygen: FCReactive<React.DetailedHTMLProps<React.KeygenHTMLAttributes<HTMLElement>, HTMLElement>>;
    label: FCReactive<React.DetailedHTMLProps<React.LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement>>;
    legend: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLLegendElement>, HTMLLegendElement>>;
    li: FCReactive<React.DetailedHTMLProps<React.LiHTMLAttributes<HTMLLIElement>, HTMLLIElement>>;
    link: FCReactive<React.DetailedHTMLProps<React.LinkHTMLAttributes<HTMLLinkElement>, HTMLLinkElement>>;
    main: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    map: FCReactive<React.DetailedHTMLProps<React.MapHTMLAttributes<HTMLMapElement>, HTMLMapElement>>;
    mark: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    menu: FCReactive<React.DetailedHTMLProps<React.MenuHTMLAttributes<HTMLElement>, HTMLElement>>;
    menuitem: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    meta: FCReactive<React.DetailedHTMLProps<React.MetaHTMLAttributes<HTMLMetaElement>, HTMLMetaElement>>;
    meter: FCReactive<React.DetailedHTMLProps<React.MeterHTMLAttributes<HTMLMeterElement>, HTMLMeterElement>>;
    nav: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    noindex: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    noscript: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    object: FCReactive<React.DetailedHTMLProps<React.ObjectHTMLAttributes<HTMLObjectElement>, HTMLObjectElement>>;
    ol: FCReactive<React.DetailedHTMLProps<React.OlHTMLAttributes<HTMLOListElement>, HTMLOListElement>>;
    optgroup: FCReactive<
        React.DetailedHTMLProps<React.OptgroupHTMLAttributes<HTMLOptGroupElement>, HTMLOptGroupElement>
    >;
    option: FCReactive<React.DetailedHTMLProps<React.OptionHTMLAttributes<HTMLOptionElement>, HTMLOptionElement>>;
    output: FCReactive<React.DetailedHTMLProps<React.OutputHTMLAttributes<HTMLOutputElement>, HTMLOutputElement>>;
    p: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>>;
    param: FCReactive<React.DetailedHTMLProps<React.ParamHTMLAttributes<HTMLParamElement>, HTMLParamElement>>;
    picture: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    pre: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLPreElement>, HTMLPreElement>>;
    progress: FCReactive<
        React.DetailedHTMLProps<React.ProgressHTMLAttributes<HTMLProgressElement>, HTMLProgressElement>
    >;
    q: FCReactive<React.DetailedHTMLProps<React.QuoteHTMLAttributes<HTMLQuoteElement>, HTMLQuoteElement>>;
    rp: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    rt: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    ruby: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    s: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    samp: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    slot: FCReactive<React.DetailedHTMLProps<React.SlotHTMLAttributes<HTMLSlotElement>, HTMLSlotElement>>;
    script: FCReactive<React.DetailedHTMLProps<React.ScriptHTMLAttributes<HTMLScriptElement>, HTMLScriptElement>>;
    section: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    select: FCReactive<React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>>;
    small: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    source: FCReactive<React.DetailedHTMLProps<React.SourceHTMLAttributes<HTMLSourceElement>, HTMLSourceElement>>;
    span: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>>;
    strong: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    style: FCReactive<React.DetailedHTMLProps<React.StyleHTMLAttributes<HTMLStyleElement>, HTMLStyleElement>>;
    sub: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    summary: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    sup: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    table: FCReactive<React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>>;
    template: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTemplateElement>, HTMLTemplateElement>>;
    tbody: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>;
    td: FCReactive<React.DetailedHTMLProps<React.TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>>;
    textarea: FCReactive<
        React.DetailedHTMLProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>
    >;
    tfoot: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>;
    th: FCReactive<
        React.DetailedHTMLProps<React.ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>
    >;
    thead: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>>;
    time: FCReactive<React.DetailedHTMLProps<React.TimeHTMLAttributes<HTMLTimeElement>, HTMLTimeElement>>;
    title: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTitleElement>, HTMLTitleElement>>;
    tr: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>>;
    track: FCReactive<React.DetailedHTMLProps<React.TrackHTMLAttributes<HTMLTrackElement>, HTMLTrackElement>>;
    u: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    ul: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLUListElement>, HTMLUListElement>>;
    var: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    video: FCReactive<React.DetailedHTMLProps<React.VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement>>;
    wbr: FCReactive<React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>>;
    webview: FCReactive<React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>>;
};
