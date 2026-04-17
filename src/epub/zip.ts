// EPUB ZIP handler - works with ArrayBuffer
import JSZip from "jszip";

export class EpubZip {
  private sourceZip: JSZip;
  private targetZip: JSZip;
  private processedFiles: Set<string> = new Set();

  private constructor(sourceZip: JSZip, targetZip: JSZip) {
    this.sourceZip = sourceZip;
    this.targetZip = targetZip;
  }

  static async open(sourceData: ArrayBuffer): Promise<EpubZip> {
    const source = await JSZip.loadAsync(sourceData);
    const target = new JSZip();
    return new EpubZip(source, target);
  }

  async readText(path: string): Promise<string | null> {
    const file = this.sourceZip.file(path);
    if (!file) return null;
    return await file.async("string");
  }

  async readBinary(path: string): Promise<Uint8Array | null> {
    const file = this.sourceZip.file(path);
    if (!file) return null;
    const data = await file.async("uint8array");
    return data;
  }

  writeText(path: string, content: string): void {
    this.targetZip.file(path, content);
    this.processedFiles.add(path);
  }

  writeBinary(path: string, data: Uint8Array): void {
    this.targetZip.file(path, data);
    this.processedFiles.add(path);
  }

  async migrate(path: string): Promise<void> {
    const content = await this.readBinary(path);
    if (content) {
      this.writeBinary(path, content);
    }
  }

  listFiles(): string[] {
    return Object.keys(this.sourceZip.files).filter(
      (path) => this.sourceZip.files[path]?.dir !== true,
    );
  }

  async generate(): Promise<Blob> {
    // Migrate any remaining files not explicitly written
    const allFiles = this.listFiles();
    for (const path of allFiles) {
      if (!this.processedFiles.has(path)) {
        await this.migrate(path);
      }
    }
    return await this.targetZip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }
}
