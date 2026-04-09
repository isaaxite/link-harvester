import { LinkTarget, LinkType, OpDescriptor, OpDescriptorType, OpFilterDescriptor, OpGatherDescriptor } from "./index";

/**
 * Type guard to check if a value is a valid LinkType
 * @param type - The value to check
 * @returns True if the value is a LinkType enum member
 */
export function isLinkType(type: LinkType): type is LinkType {
  return [
    LinkType.HtmlAnchor,
    LinkType.HtmlImage,
    LinkType.MarkdownImage,
    LinkType.MarkdownLink,
  ].includes(type);
}

/**
 * Type guard to check if a value is a valid LinkTarget
 * @param type - The value to check
 * @returns True if the value is a LinkTarget enum member
 */
export function isLinkTarget(type: LinkTarget): type is LinkTarget {
  return [
    LinkTarget.ExternalPage,
    LinkTarget.ExternalResource,
    LinkTarget.InPageAnchor,
    LinkTarget.LocalResource,
    LinkTarget.Other,
  ].includes(type);
}

/**
 * Type guard to check if an operation descriptor is a Gather operation
 * @param op - The operation descriptor to check
 * @returns True if the operation is a Gather descriptor
 */
export function isOpGatherDescriptor(op: OpDescriptor): op is OpGatherDescriptor {
  return op.type === OpDescriptorType.Gather;
}

/**
 * Type guard to check if an operation descriptor is a Filter operation
 * @param op - The operation descriptor to check
 * @returns True if the operation is a Filter descriptor
 */
export function isOpFilterDescriptor(op: OpDescriptor): op is OpFilterDescriptor {
  return op.type === OpDescriptorType.Filter;
}
