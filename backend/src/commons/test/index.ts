/* eslint-disable @typescript-eslint/no-explicit-any */
export const repoMock = (arrayOffMultiValues: any[], oneValue: any) => {
  return {
    find: jest.fn().mockResolvedValue(arrayOffMultiValues),
    findOneOrFail: jest.fn().mockResolvedValue(oneValue),
    findById: jest.fn().mockImplementation(() => {
      return oneValue
    }),
    findOne: jest.fn().mockImplementation(() => {
      return oneValue
    }),
    create: jest.fn().mockReturnValue(oneValue),
    save: jest.fn().mockImplementation(dto => {
      return {
        id: Math.random() * (1000 - 1) + 1,
        ...dto,
      }
    }),
    // as these do not actually use their return values in our sample
    // we just make sure that their resolve is true to not crash
    updateById: jest.fn().mockResolvedValue(true),
    // as these do not actually use their return values in our sample
    // we just make sure that their resolve is true to not crash
    delete: jest.fn().mockResolvedValue(true),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(oneValue),
    })),
  }
}
