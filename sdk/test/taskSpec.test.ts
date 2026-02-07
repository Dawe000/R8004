import { fetchTaskSpecFromOnchainUri, parseOnchainTaskSpec } from "../src/taskSpec.js";
import { getTaskDescriptionUri } from "../src/tasks.js";
import { fetchFromIpfs } from "../src/ipfs.js";

jest.mock("../src/tasks.js", () => ({
  getTaskDescriptionUri: jest.fn(),
}));

jest.mock("../src/ipfs.js", () => ({
  fetchFromIpfs: jest.fn(),
}));

describe("taskSpec parsing", () => {
  it("parses valid v1 JSON payload", () => {
    const raw = JSON.stringify({
      version: "erc8001-task/v1",
      input: "Summarize BTC sentiment",
      skill: "twitter_sentiment_snapshot",
      model: "zai-org-glm-4.7",
    });

    expect(parseOnchainTaskSpec(raw)).toEqual({
      version: "erc8001-task/v1",
      input: "Summarize BTC sentiment",
      skill: "twitter_sentiment_snapshot",
      model: "zai-org-glm-4.7",
    });
  });

  it("falls back to plain text when payload is not JSON", () => {
    expect(parseOnchainTaskSpec("  Build me a market brief  ")).toEqual({
      version: "plain-text",
      input: "Build me a market brief",
    });
  });

  it("throws on unsupported JSON schema", () => {
    const raw = JSON.stringify({
      version: "erc8001-task/v2",
      input: "hello",
    });

    expect(() => parseOnchainTaskSpec(raw)).toThrow(
      "Invalid on-chain task spec: unsupported JSON schema"
    );
  });

  it("throws when v1 JSON input is missing", () => {
    const raw = JSON.stringify({
      version: "erc8001-task/v1",
      input: "",
    });

    expect(() => parseOnchainTaskSpec(raw)).toThrow(
      "Invalid on-chain task spec: input is required for erc8001-task/v1"
    );
  });

  it("throws on malformed JSON content", () => {
    expect(() => parseOnchainTaskSpec("{not-json")).toThrow(
      "Invalid on-chain task spec: malformed JSON content"
    );
  });

  it("parses object input directly", () => {
    expect(
      parseOnchainTaskSpec({
        version: "erc8001-task/v1",
        input: "Run this from object",
        skill: "alpha",
      })
    ).toEqual({
      version: "erc8001-task/v1",
      input: "Run this from object",
      skill: "alpha",
    });
  });

  describe("fetchTaskSpecFromOnchainUri", () => {
    const mockedGetTaskDescriptionUri = getTaskDescriptionUri as jest.MockedFunction<typeof getTaskDescriptionUri>;
    const mockedFetchFromIpfs = fetchFromIpfs as jest.MockedFunction<typeof fetchFromIpfs>;

    beforeEach(() => {
      mockedGetTaskDescriptionUri.mockReset();
      mockedFetchFromIpfs.mockReset();
    });

    it("fetches URI from chain and parses v1 JSON", async () => {
      mockedGetTaskDescriptionUri.mockResolvedValue("ipfs://cid123");
      mockedFetchFromIpfs.mockResolvedValue(
        JSON.stringify({
          version: "erc8001-task/v1",
          input: "On-chain prompt",
          skill: "twitter_sentiment_snapshot",
          model: "zai-org-glm-4.7",
        })
      );

      const result = await fetchTaskSpecFromOnchainUri(
        "0xescrow",
        {} as any,
        42n,
        { fromBlock: 100n }
      );

      expect(mockedGetTaskDescriptionUri).toHaveBeenCalledWith(
        "0xescrow",
        expect.anything(),
        42n,
        100n
      );
      expect(mockedFetchFromIpfs).toHaveBeenCalledWith("ipfs://cid123", {
        gateway: undefined,
        asJson: false,
      });
      expect(result).toEqual({
        descriptionURI: "ipfs://cid123",
        rawContent: expect.any(String),
        parsed: {
          version: "erc8001-task/v1",
          input: "On-chain prompt",
          skill: "twitter_sentiment_snapshot",
          model: "zai-org-glm-4.7",
        },
      });
    });

    it("supports plain-text task payloads", async () => {
      mockedGetTaskDescriptionUri.mockResolvedValue("ipfs://legacy");
      mockedFetchFromIpfs.mockResolvedValue("legacy prompt");

      const result = await fetchTaskSpecFromOnchainUri("0xescrow", {} as any, 7n);

      expect(result.parsed).toEqual({
        version: "plain-text",
        input: "legacy prompt",
      });
    });

    it("throws when description URI is missing", async () => {
      mockedGetTaskDescriptionUri.mockResolvedValue(null);

      await expect(
        fetchTaskSpecFromOnchainUri("0xescrow", {} as any, 9n)
      ).rejects.toThrow("Task 9 has no description URI in TaskCreated event");
    });
  });
});
