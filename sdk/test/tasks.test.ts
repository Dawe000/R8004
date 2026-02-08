import { getTaskDescriptionUri } from "../src/tasks.js";
import { getEscrowContract } from "../src/contract.js";

jest.mock("../src/contract.js", () => ({
  getEscrowContract: jest.fn(),
}));

describe("tasks log querying", () => {
  const mockedGetEscrowContract = getEscrowContract as jest.MockedFunction<
    typeof getEscrowContract
  >;

  beforeEach(() => {
    mockedGetEscrowContract.mockReset();
  });

  it("shrinks chunk size when rpc enforces small log ranges", async () => {
    const queryFilter = jest
      .fn()
      .mockImplementation(async (_filter, fromBlock: bigint, toBlock: bigint) => {
        const range = toBlock - fromBlock + 1n;
        if (range > 30n) {
          throw new Error(
            `requested too many blocks from ${fromBlock.toString()} to ${toBlock.toString()}, maximum is set to 30`
          );
        }
        if (fromBlock <= 5n && toBlock >= 5n) {
          return [
            {
              args: {
                taskId: 5n,
                descriptionURI: "ipfs://task-5",
              },
            },
          ];
        }
        return [];
      });

    mockedGetEscrowContract.mockReturnValue({
      filters: {
        TaskCreated: jest.fn(() => ({})),
      },
      queryFilter,
    } as unknown as ReturnType<typeof getEscrowContract>);

    const descriptionURI = await getTaskDescriptionUri(
      "0xescrow",
      { getBlockNumber: async () => 120 } as any,
      5n,
      0n
    );

    expect(descriptionURI).toBe("ipfs://task-5");
    expect(queryFilter).toHaveBeenCalled();
  });

  it("rethrows non-range errors", async () => {
    const queryFilter = jest.fn().mockRejectedValue(new Error("rpc down"));
    mockedGetEscrowContract.mockReturnValue({
      filters: {
        TaskCreated: jest.fn(() => ({})),
      },
      queryFilter,
    } as unknown as ReturnType<typeof getEscrowContract>);

    await expect(
      getTaskDescriptionUri(
        "0xescrow",
        { getBlockNumber: async () => 50 } as any,
        1n,
        0n
      )
    ).rejects.toThrow("rpc down");
  });
});
