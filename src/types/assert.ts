import { LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDescriptorType, OpDetectExternalRefsDescriptor, OpFilterDescriptor, OpGatherDescriptor } from "./index";

export function isLinkType(type: LinkType): type is LinkType {
  return [
    LinkType.HtmlAnchor,
    LinkType.HtmlImage,
    LinkType.MarkdownImage,
    LinkType.MarkdownLink,
  ].includes(type);
}

export function isLinkTarget(type: LinkTarget): type is LinkTarget {
  return [
    LinkTarget.ExternalPage,
    LinkTarget.ExternalResource,
    LinkTarget.InPageAnchor,
    LinkTarget.LocalResource,
    LinkTarget.Other,
  ].includes(type);
}

export function isOpGatherDescriptor(op: OpDescriptor): op is OpGatherDescriptor {
  return op.type === OpDescriptorType.Gather;
}

export function isOpFilterDescriptor(op: OpDescriptor): op is OpFilterDescriptor {
  return op.type === OpDescriptorType.Filfer;
}

export function isOpClassifyDescriptor(op: OpDescriptor): op is OpClassifyDescriptor {
  return op.type === OpDescriptorType.Classify;
}

export function isOpDetectExternalRefsDescriptor(op: OpDescriptor): op is OpDetectExternalRefsDescriptor {
  return op.type === OpDescriptorType.DetectExternalRefs;
}
