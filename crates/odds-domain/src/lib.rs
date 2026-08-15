#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DecimalOdds(f64);

impl DecimalOdds {
    pub fn new(value: f64) -> Result<Self, OddsError> {
        if value.is_finite() && value > 1.0 {
            Ok(Self(value))
        } else {
            Err(OddsError::InvalidDecimalOdds(value))
        }
    }

    pub fn value(self) -> f64 {
        self.0
    }

    pub fn implied_probability(self) -> f64 {
        1.0 / self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OddsError {
    InvalidDecimalOdds(f64),
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

pub fn cut_rate(local: DecimalOdds, benchmark: DecimalOdds) -> f64 {
    1.0 - (local.value() / benchmark.value())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_and_overround_are_consistent() {
        let market = ThreeWayMarket {
            home: DecimalOdds::new(2.0).unwrap(),
            draw: DecimalOdds::new(3.2).unwrap(),
            away: DecimalOdds::new(3.3).unwrap(),
        };

        assert!((market.overround() - 0.115530303).abs() < 1e-6);
        assert!((market.payout_rate() - 0.896433).abs() < 1e-5);
    }

    #[test]
    fn cut_rate_is_relative_to_benchmark() {
        let local = DecimalOdds::new(2.0).unwrap();
        let benchmark = DecimalOdds::new(2.12).unwrap();

        assert!((cut_rate(local, benchmark) - 0.05660377).abs() < 1e-6);
    }
}
