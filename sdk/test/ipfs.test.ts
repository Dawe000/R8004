import { uploadJson, uploadText, uploadFile, isLikelyUri } from "../src/ipfs.js";

const mockConfig = {
  provider: "mock" as const,
  uriScheme: "ipfs" as const,
};

describe("IPFS mock", () => {
  it("uploadJson returns ipfs URI", async () => {
    const uri = await uploadJson({ foo: "bar" }, mockConfig);
    expect(uri).toMatch(/^ipfs:\/\/mock[a-f0-9]+$/);
  });

  it("uploadJson is deterministic - same content = same URI", async () => {
    const data = { taskId: 1, spec: "test" };
    const u1 = await uploadJson(data, mockConfig);
    const u2 = await uploadJson(data, mockConfig);
    expect(u1).toBe(u2);
  });

  it("uploadJson different content = different URI", async () => {
    const u1 = await uploadJson({ a: 1 }, mockConfig);
    const u2 = await uploadJson({ a: 2 }, mockConfig);
    expect(u1).not.toBe(u2);
  });

  it("uploadFile returns ipfs URI", async () => {
    const uri = await uploadFile(new Uint8Array([1, 2, 3]), mockConfig);
    expect(uri).toMatch(/^ipfs:\/\/mock[a-f0-9]+$/);
  });

  it("mock respects uriScheme https", async () => {
    const uri = await uploadJson({ x: 1 }, {
      ...mockConfig,
      uriScheme: "https",
    });
    expect(uri).toMatch(/^https:\/\/ipfs\.io\/ipfs\/mock[a-f0-9]+$/);
  });

  it("uploadText returns ipfs URI for plain text", async () => {
    const uri = await uploadText("Build me a todo app", mockConfig);
    expect(uri).toMatch(/^ipfs:\/\/mock[a-f0-9]+$/);
  });

  it("isLikelyUri returns true for URI schemes", () => {
    expect(isLikelyUri("ipfs://Qm...")).toBe(true);
    expect(isLikelyUri("https://example.com")).toBe(true);
    expect(isLikelyUri("http://example.com")).toBe(true);
    expect(isLikelyUri("ar://xyz")).toBe(true);
  });

  it("isLikelyUri returns false for plain text", () => {
    expect(isLikelyUri("Build me a todo app")).toBe(false);
    expect(isLikelyUri("hello")).toBe(false);
  });
});
