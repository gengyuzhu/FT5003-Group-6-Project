/**
 * Maps smart contract custom errors and common wagmi/viem errors
 * to user-friendly messages in both English and Chinese.
 */

const ERROR_MAP = {
  // NFTMarketplace custom errors
  PriceZero: {
    en: "Price cannot be zero.",
    zh: "价格不能为零。",
  },
  NotTokenOwner: {
    en: "You don't own this NFT.",
    zh: "你不是这个 NFT 的持有者。",
  },
  MarketplaceNotApproved: {
    en: "Please approve the marketplace to transfer your NFT first.",
    zh: "请先授权市场合约转移你的 NFT。",
  },
  ListingNotActive: {
    en: "This listing is no longer active.",
    zh: "该挂单已不再有效。",
  },
  ListingExpiredError: {
    en: "This listing has expired.",
    zh: "该挂单已过期。",
  },
  IncorrectPrice: {
    en: "Incorrect payment amount. Please check the price.",
    zh: "支付金额不正确，请检查价格。",
  },
  SellerCannotBuy: {
    en: "You cannot buy your own listing.",
    zh: "你不能购买自己的挂单。",
  },
  NotTheSeller: {
    en: "Only the seller can perform this action.",
    zh: "只有卖家可以执行此操作。",
  },
  AuctionAlreadyEnded: {
    en: "This auction has already ended.",
    zh: "该拍卖已经结束。",
  },
  AuctionExpired: {
    en: "This auction has expired. No more bids accepted.",
    zh: "该拍卖已过期，无法继续出价。",
  },
  AuctionNotExpired: {
    en: "The auction hasn't ended yet.",
    zh: "拍卖尚未结束。",
  },
  SellerCannotBid: {
    en: "You cannot bid on your own auction.",
    zh: "你不能对自己的拍卖出价。",
  },
  BidBelowStartPrice: {
    en: "Your bid is below the starting price.",
    zh: "出价低于起拍价。",
  },
  BidTooLow: {
    en: "Your bid is too low.",
    zh: "出价太低。",
  },
  BidIncrementTooLow: {
    en: "Bid must be at least 5% higher than the current highest bid.",
    zh: "出价必须比当前最高价高至少 5%。",
  },
  NothingToWithdraw: {
    en: "No funds available to withdraw.",
    zh: "没有可提取的资金。",
  },
  TransferFailed: {
    en: "Transfer failed. Please try again.",
    zh: "转账失败，请重试。",
  },
  FeeTooHigh: {
    en: "Platform fee exceeds maximum allowed (10%).",
    zh: "平台费超过最大允许值 (10%)。",
  },
  InvalidDuration: {
    en: "Duration must be between 1 hour and 7 days.",
    zh: "时长必须在 1 小时到 7 天之间。",
  },
  AuctionHasBids: {
    en: "Cannot cancel an auction that already has bids.",
    zh: "无法取消已有出价的拍卖。",
  },
  // NFTCollection custom errors
  RoyaltyFeeTooHigh: {
    en: "Royalty fee cannot exceed 10%.",
    zh: "版税不能超过 10%。",
  },
  // SimpleOracle custom errors
  PriceIsStale: {
    en: "Oracle price data is stale. Waiting for fresh data.",
    zh: "预言机价格数据已过期，正在等待新数据。",
  },
  NoPriceSubmitted: {
    en: "No price data has been submitted to the oracle yet.",
    zh: "尚未向预言机提交价格数据。",
  },
  // Common wallet / transaction errors
  UserRejectedRequestError: {
    en: "Transaction was rejected in your wallet.",
    zh: "交易已在钱包中被拒绝。",
  },
  InsufficientFundsError: {
    en: "Insufficient funds for this transaction.",
    zh: "余额不足，无法完成此交易。",
  },
};

/**
 * Parse a contract revert error and return a friendly message.
 * Falls back to a generic message if no mapping is found.
 *
 * @param {Error|string} error - The error from wagmi/viem
 * @param {string} lang - "en" | "zh" (default: "en")
 * @returns {string} Friendly error message
 */
export function getFriendlyError(error, lang = "en") {
  if (!error) return "";

  const errorStr = typeof error === "string" ? error : error.message || error.shortMessage || String(error);

  // Check for custom error names in the error string
  for (const [key, messages] of Object.entries(ERROR_MAP)) {
    if (errorStr.includes(key)) {
      return messages[lang] || messages.en;
    }
  }

  // Common patterns
  if (errorStr.includes("user rejected") || errorStr.includes("User denied") || errorStr.includes("ACTION_REJECTED")) {
    return ERROR_MAP.UserRejectedRequestError[lang] || ERROR_MAP.UserRejectedRequestError.en;
  }

  if (errorStr.includes("insufficient funds") || errorStr.includes("INSUFFICIENT_FUNDS")) {
    return ERROR_MAP.InsufficientFundsError[lang] || ERROR_MAP.InsufficientFundsError.en;
  }

  if (errorStr.includes("nonce too low")) {
    return lang === "zh" ? "交易 nonce 过低，请重试。" : "Transaction nonce too low. Please try again.";
  }

  if (errorStr.includes("gas")) {
    return lang === "zh" ? "Gas 估算失败，交易可能会失败。" : "Gas estimation failed. The transaction may fail.";
  }

  // Fallback
  return lang === "zh" ? "交易失败，请重试。" : "Transaction failed. Please try again.";
}
