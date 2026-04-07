import { getInvokedChainStr } from "../utils";
import { InvokedChain, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDescriptorType, OpDetectExternalRefsDescriptor, OpFilterDescriptor, OpGatherDescriptor } from "./index";

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

export class InvokedChainAssert {
  constructor(
    private invokedChainStr: InvokedChain
  ) {}

  isFInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor] {
    return this.invokedChainStr === InvokedChain.F;
  }

  isDInvokeChain(ops: OpDescriptor[]): ops is [OpDetectExternalRefsDescriptor] {
    return this.invokedChainStr === InvokedChain.D;
  }

  isDFInvokeChain(ops: OpDescriptor[]): ops is [OpDetectExternalRefsDescriptor, OpFilterDescriptor] {
    return this.invokedChainStr === InvokedChain.DF;
  }

  isFDInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpDetectExternalRefsDescriptor] {
    return this.invokedChainStr === InvokedChain.FD;
  }

  isFDFInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpDetectExternalRefsDescriptor, OpFilterDescriptor] {
    return this.invokedChainStr === InvokedChain.FDF;
  }

  isCInvokeChain(ops: OpDescriptor[]): ops is [OpClassifyDescriptor] {
    return this.invokedChainStr === InvokedChain.C;
  }

  isCDInvokeChain(ops: OpDescriptor[]): ops is [OpClassifyDescriptor, OpDetectExternalRefsDescriptor] {
    return this.invokedChainStr === InvokedChain.CD;
  }

  isFCInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpClassifyDescriptor] {
    return this.invokedChainStr === InvokedChain.FC;
  }

  isDFCInvokeChain(ops: OpDescriptor[]): ops is [OpDetectExternalRefsDescriptor, OpFilterDescriptor, OpClassifyDescriptor] {
    return this.invokedChainStr === InvokedChain.DFC;
  }

  isFCDInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpClassifyDescriptor, OpDetectExternalRefsDescriptor] {
    return this.invokedChainStr === InvokedChain.FCD;
  }

  isFDCInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpDetectExternalRefsDescriptor, OpClassifyDescriptor] {
    return this.invokedChainStr === InvokedChain.FDC;
  }

  isFDFCInvokeChain(ops: OpDescriptor[]): ops is [OpFilterDescriptor, OpDetectExternalRefsDescriptor, OpFilterDescriptor, OpClassifyDescriptor] {
    return this.invokedChainStr === InvokedChain.FDFC;
  }
}
