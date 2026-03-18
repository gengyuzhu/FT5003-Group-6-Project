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
  OracleNotSet: {
    en: "Oracle is not configured. Please contact the platform admin.",
    zh: "预言机尚未配置，请联系平台管理员。",
  },
  InsufficientPayment: {
    en: "Payment amount is incorrect. Please refresh and try again.",
    zh: "支付金额不正确，请刷新后重试。",
  },
  ExcessivePayment: {
    en: "Payment exceeds the allowed slippage tolerance. Please refresh the price and try again.",
    zh: "支付金额超出允许的滑点范围，请刷新价格后重试。",
  },
  // NFTCollection custom errors
  RoyaltyFeeTooHigh: {
    en: "Royalty fee cannot exceed 10%.",
    zh: "版税不能超过 10%。",
  },
  // SimpleOracle custom errors
  StalePrice: {
    en: "Oracle price data is stale. Waiting for fresh data.",
    zh: "预言机价格数据已过期，正在等待新数据。",
  },
  NoPrice: {
    en: "No price data has been submitted to the oracle yet.",
    zh: "尚未向预言机提交价格数据。",
  },
  PriceDeviationTooHigh: {
    en: "Submitted price deviates too far from the current oracle price.",
    zh: "提交的价格与当前预言机价格偏差过大。",
  },
  ArrayLengthMismatch: {
    en: "Array lengths do not match. Token IDs, prices, and durations must have the same length.",
    zh: "数组长度不匹配。代币ID、价格和持续时间必须具有相同的长度。",
  },
  BatchTooLarge: {
    en: "Batch size exceeds the maximum of 20 NFTs per transaction.",
    zh: "批量大小超过每笔交易最多20个NFT的限制。",
  },
  EndPriceTooHigh: {
    en: "End price must be lower than start price for Dutch auctions.",
    zh: "荷兰拍卖的结束价格必须低于起始价格。",
  },
  DutchAuctionEnded: {
    en: "This Dutch auction has already ended or been sold.",
    zh: "该荷兰拍卖已结束或已售出。",
  },
  OfferNotActive: {
    en: "This offer is no longer active.",
    zh: "该报价已不再有效。",
  },
  OfferExpired: {
    en: "This offer has expired.",
    zh: "该报价已过期。",
  },
  SwapNotActive: {
    en: "This swap proposal is no longer active.",
    zh: "该交换提案已不再有效。",
  },
  NotCounterparty: {
    en: "Only the designated counterparty can accept this swap.",
    zh: "只有指定的交换对手方可以接受此交换。",
  },
  SwapExpired: {
    en: "This swap proposal has expired.",
    zh: "该交换提案已过期。",
  },
  RoundTooFrequent: {
    en: "Oracle round finalization too frequent. Please wait before submitting.",
    zh: "预言机轮次结算过于频繁，请稍后再提交。",
  },
  AlreadySubmitted: {
    en: "You have already submitted a price for this round.",
    zh: "你已经在本轮中提交了价格。",
  },
  NotAuthorizedReporter: {
    en: "You are not authorized to submit prices to the oracle.",
    zh: "你无权向预言机提交价格。",
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
