#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DecimalOdds(f64);

impl DecimalOdds {
    pub fn new(value: f64) -> Option<Self> {
        (value > 1.0 && value.is_finite()).then_some(Self(value))
    }

    pub const fn value(self) -> f64 {
        self.0
    }

    pub fn implied_probability(self) -> f64 {
        1.0 / self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ThreeWayMarket {
    pub home: DecimalOdds,
    pub draw: DecimalOdds,
    pub away: DecimalOdds,
}

impl ThreeWayMarket {
    pub fn book_percentage(self) -> f64 {
        self.home.implied_probability()
            + self.draw.implied_probability()
            + self.away.implied_probability()
    }

    pub fn overround(self) -> f64 {
        self.book_percentage() - 1.0
    }

    pub fn payout_rate(self) -> f64 {
        1.0 / self.book_percentage()
    }

    pub fn fair_odds(self) -> [f64; 3] {
        let book = self.book_percentage();
        [
            book / self.home.implied_probability(),
            book / self.draw.implied_probability(),
            book / self.away.implied_probability(),
        ]
    }
}

pub fn cut_rate(local: DecimalOdds, reference: DecimalOdds) -> f64 {
    1.0 - local.value() / reference.value()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn odds(value: f64) -> DecimalOdds {
        DecimalOdds::new(value).unwrap()
    }

    #[test]
    fn rejects_invalid_decimal_odds() {
        assert!(DecimalOdds::new(1.0).is_none());
        assert!(DecimalOdds::new(f64::NAN).is_none());
    }

    #[test]
    fn calculates_market_metrics() {
        let market = ThreeWayMarket {
            home: odds(2.00),
            draw: odds(3.20),
            away: odds(3.30),
        };

        assert!((market.book_percentage() - 1.115530303).abs() < 1e-9);
        assert!((market.payout_rate() - 0.896434634).abs() < 1e-9);
        assert!((market.overround() - 0.115530303).abs() < 1e-9);
    }

    #[test]
    fn calculates_cut_rate_against_reference() {
        let result = cut_rate(odds(2.00), odds(2.12));
        assert!((result - 0.0566037735).abs() < 1e-9);
    }
}
